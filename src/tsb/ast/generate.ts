/**
 * Generate `src/tsb/ast/nodes.generated.ts` from the tree-sitter
 * grammar's `node-types.json`. Each named grammar node becomes a
 * typed TS interface; the union of all node types is exposed as
 * `AstNode`. Run after any grammar change:
 *
 *   bun run src/tsb/ast/generate.ts
 *
 * The generated file is committed (no codegen-on-build).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface NodeChildSpec {
  multiple: boolean;
  required: boolean;
  types: { type: string; named: boolean }[];
}

interface NodeSpec {
  type: string;
  named?: boolean;
  fields?: Record<string, NodeChildSpec>;
  children?: NodeChildSpec;
  subtypes?: { type: string; named: boolean }[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE_TYPES = resolve(HERE, "../../../zed/tree-sitter-tsb/src/node-types.json");
const OUT = resolve(HERE, "nodes.generated.ts");

const HEADER = `// AUTO-GENERATED from zed/tree-sitter-tsb/src/node-types.json.
// Re-run \`bun run src/tsb/ast/generate.ts\` after any grammar change.

/** Source position (1-based row/column). */
export interface Point { row: number; column: number }

/** Byte span covering a syntax node. */
export interface Range { startIndex: number; endIndex: number; startPosition: Point; endPosition: Point }

/** Common fields every AST node carries. */
export interface NodeBase extends Range {
  /** Raw source text covered by the node — handy for opaque or
   *  literal nodes where we don't need a structured representation. */
  text: string;
}

`;

const nodes: NodeSpec[] = JSON.parse(readFileSync(NODE_TYPES, "utf-8"));

const named = nodes.filter((n) => n.named === true);

function toPascal(snake: string): string {
  return snake
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function interfaceName(typeName: string): string {
  // `null` and `undefined` are JS reserved literals; the grammar
  // renamed them to *_literal already, so this is just routine.
  return `${toPascal(typeName)}Node`;
}

function renderChildType(spec: NodeChildSpec): string {
  // Only NAMED types end up in the AST — anonymous tokens like `;`
  // or `,` aren't represented as nodes the user navigates.
  const named = spec.types.filter((t) => t.named);
  const inner =
    named.length === 0
      ? "NodeBase"
      : named.map((t) => interfaceName(t.type)).join(" | ");
  if (!spec.multiple) {
    // Single child / field.
    return spec.required ? inner : `${inner} | undefined`;
  }
  // Multiple children become a (possibly empty) array.
  return `(${inner})[]`;
}

const lines: string[] = [];

// One interface per named node.
for (const node of named) {
  if (node.subtypes && node.subtypes.length > 0) {
    // "Supertype" — a union over a set of subtypes. Tree-sitter uses
    // these for grammar choice rules with a name. Emit as a union.
    const variants = node.subtypes
      .filter((s) => s.named)
      .map((s) => interfaceName(s.type))
      .join(" | ");
    lines.push(`export type ${interfaceName(node.type)} = ${variants};`);
    lines.push("");
    continue;
  }

  lines.push(`/** Grammar node \`${node.type}\`. */`);
  lines.push(`export interface ${interfaceName(node.type)} extends NodeBase {`);
  // `kind` rather than `type` so it doesn't collide with grammar
  // field names like `let x: <type>`.
  lines.push(`  kind: "${node.type}";`);

  if (node.fields) {
    for (const [fieldName, spec] of Object.entries(node.fields)) {
      const ty = renderChildType(spec);
      const optional = spec.required ? "" : "?";
      lines.push(`  ${fieldName}${optional}: ${ty};`);
    }
  }

  if (node.children) {
    const ty = renderChildType(node.children);
    lines.push(`  children: ${ty};`);
  }

  lines.push("}");
  lines.push("");
}

// Convenience union over every named node.
lines.push("/** Discriminated union over every named node in the grammar. */");
lines.push(`export type AstNode =`);
for (const node of named) {
  if (node.subtypes && node.subtypes.length > 0) continue;
  lines.push(`  | ${interfaceName(node.type)}`);
}
lines.push(";");

writeFileSync(OUT, HEADER + lines.join("\n") + "\n");

console.log(`wrote ${OUT} (${named.length} named nodes)`);
