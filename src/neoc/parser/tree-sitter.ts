/**
 * Tree-sitter-backed parser. Loads the grammar's WASM once, parses
 * source text into a tree, then walks it to produce a typed AST that
 * codegens consume.
 *
 * The typed AST shape lives in `../ast/nodes.generated.ts` — one
 * interface per named grammar node, with `kind: "<grammar_name>"`
 * for runtime discrimination. The walker below is mechanical: read
 * each node's named children, build the corresponding typed record.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Language, Node as TreeSitterNode, Parser } from "web-tree-sitter";
import type {
  AstNode,
  NodeBase,
  Point,
  SourceFileNode,
} from "../ast/nodes.generated.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// Built once via `cd zed/tree-sitter-neoc && tree-sitter build --wasm`.
const WASM_PATH = resolve(HERE, "../../../zed/tree-sitter-neoc/tree-sitter-neoc.wasm");

let parserPromise: Promise<Parser> | undefined;

async function getParser(): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init();
      const language = await Language.load(readFileSync(WASM_PATH));
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}

/**
 * Parse a source string into our typed AST. The returned root is
 * always a `SourceFileNode`; intermediate parse failures are
 * preserved as `ERROR` nodes inside the tree (you can detect them
 * via `tree.rootNode.hasError`).
 */
export async function parseToAst(source: string): Promise<SourceFileNode> {
  const parser = await getParser();
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error("neoc parse failed: tree-sitter returned no tree");
  }
  const ast = nodeToAst(tree.rootNode);
  tree.delete();
  if (ast.kind !== "source_file") {
    throw new Error(`neoc parse: expected source_file at root, got ${ast.kind}`);
  }
  return ast;
}

// ---------------------------------------------------------------------------
// Tree-sitter Node -> typed AST node walker.
//
// Every named grammar node maps to a generated interface. For each node
// we collect:
//   - `kind`            : the grammar node name (discriminator)
//   - source range      : start/end byte + line/column
//   - `text`            : raw source text covered
//   - named children    : by field name when the grammar declares one,
//                         otherwise as a positional list
// ---------------------------------------------------------------------------

function point(p: { row: number; column: number }): Point {
  return { row: p.row, column: p.column };
}

function baseFields(node: TreeSitterNode): NodeBase {
  return {
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: point(node.startPosition),
    endPosition: point(node.endPosition),
    text: node.text,
  };
}

function nodeToAst(node: TreeSitterNode): AstNode {
  // Build the dynamic object that matches one of the generated
  // interfaces. We cast to `AstNode` at the end — the structure is
  // determined by the grammar, and tree-sitter guarantees the
  // children + fields match `node-types.json`.
  const out: Record<string, unknown> = {
    kind: node.type,
    ...baseFields(node),
  };

  // Collect named field children.
  // tree-sitter exposes field-named children via `childForFieldName`.
  // We can't enumerate the field names from a node directly in
  // web-tree-sitter, so we ask the language for the field list and
  // walk it. Since the generated AST already knows which fields each
  // node has, this is information we could codegen — for now, attach
  // every field present on the node.
  const fieldCount = (node as unknown as { fieldCount?: number }).fieldCount;
  void fieldCount; // not exposed by web-tree-sitter — see workaround below.

  // Workaround: walk all named children, asking each one its field name
  // (if any), and bucket by field. Anything without a field name lands
  // in the positional `children` list.
  // `fieldNameForChild` indexes the FULL child list (including
  // anonymous tokens like `{`, `;`, etc.), so we walk the full
  // list and filter for named children — using the same index to
  // ask for the field name.
  const fieldBuckets: Record<string, AstNode[]> = {};
  const positional: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || !child.isNamed) continue;
    const fieldName = node.fieldNameForChild(i);
    const built = nodeToAst(child);
    if (fieldName) {
      (fieldBuckets[fieldName] ??= []).push(built);
    } else {
      positional.push(built);
    }
  }

  // Single-child fields get the bare value; multi-child fields stay
  // as arrays. The generated types tell consumers what to expect, so
  // we just propagate whichever shape was on the tree.
  for (const [fieldName, values] of Object.entries(fieldBuckets)) {
    out[fieldName] = values.length === 1 ? values[0] : values;
  }
  if (positional.length > 0) {
    out.children = positional;
  }

  // The shape conforms to one of the generated interfaces — the
  // grammar guarantees which fields and children apply — but the
  // type system can't verify that from a dynamic object. Cast via
  // `unknown` so consumers get the typed discriminated union.
  return out as unknown as AstNode;
}
