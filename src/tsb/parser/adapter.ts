/**
 * Bridge from the tree-sitter-backed typed AST (`nodes.generated.ts`)
 * to the legacy `Module` / `ModulePart` shape the existing codegen +
 * macros consume.
 *
 * Lets us swap the parser without rewriting 1850 lines of codegen.
 * The codegen still walks `Module` and gets method/function bodies
 * as opaque text. Once we incrementally rewrite codegen to walk the
 * typed AST directly, this adapter goes away.
 */
import * as M from "../ast/index.ts";
import type * as N from "../ast/nodes.generated.ts";
import { parseToAst } from "./tree-sitter.ts";

export async function parseViaTreeSitter(source: string): Promise<M.ParseResult> {
  const root = await parseToAst(source);
  const parts: M.ModulePart[] = [];
  const diagnostics: M.ParseDiagnostic[] = [];

  // Walk top-level children. Between (and around) parsed declarations
  // we insert `OpaqueText` covering the literal source — preserves
  // comments, blank lines, and whitespace the codegen relies on for
  // pretty output. Without this, multi-statement files emit as one
  // line because tree-sitter nodes don't include surrounding trivia.
  let cursor = 0;
  const flushGap = (untilIndex: number): void => {
    if (untilIndex > cursor) {
      parts.push({
        kind: "opaque",
        text: source.slice(cursor, untilIndex),
        span: { start: cursor, end: untilIndex },
      });
    }
  };
  for (const child of (root.children ?? [])) {
    flushGap(child.startIndex);
    convertTopLevel(child, parts, []);
    cursor = child.endIndex;
  }
  flushGap(source.length);

  return {
    module: { parts, source },
    diagnostics,
  };
}

function convertTopLevel(
  node: N.AstNode,
  parts: M.ModulePart[],
  pendingAttrs: M.Attr[],
): void {
  switch (node.kind) {
    case "attributed_declaration": {
      const ad = node as N.AttributedDeclarationNode;
      const attrs: M.Attr[] = [];
      const inner: N.AstNode[] = [];
      for (const c of ad.children) {
        if (c.kind === "attribute") {
          attrs.push(...convertAttributes(c as N.AttributeNode));
        } else {
          inner.push(c);
        }
      }
      for (const c of inner) convertTopLevel(c, parts, attrs);
      return;
    }
    case "struct_declaration":
      parts.push(convertStruct(node as N.StructDeclarationNode, pendingAttrs));
      return;
    case "impl_declaration":
      parts.push(convertImpl(node as N.ImplDeclarationNode, pendingAttrs));
      return;
    case "trait_declaration":
      parts.push(convertTrait(node as N.TraitDeclarationNode, pendingAttrs));
      return;
    case "function_declaration":
      parts.push(convertFunction(node as N.FunctionDeclarationNode, pendingAttrs));
      return;
    default:
      // Everything else (imports, exports, type aliases, variable
      // declarations, free expression statements) passes through as
      // opaque text — the codegen forwards it verbatim. Includes a
      // trailing newline so multi-line bodies don't collapse.
      parts.push({
        kind: "opaque",
        text: node.text,
        span: { start: node.startIndex, end: node.endIndex },
      });
  }
}

function convertAttributes(node: N.AttributeNode): M.Attr[] {
  // An attribute *block* (#[a, b(x), …]) contains multiple
  // attribute_item children — flatten them out to the legacy
  // Attr[] shape that the macro system consumes.
  const out: M.Attr[] = [];
  for (const child of node.children ?? []) {
    if (child.kind !== "attribute_item") continue;
    const item = child as N.AttributeItemNode;
    const args = item.arguments;
    const argText = args?.text.slice(1, -1) ?? ""; // strip the surrounding parens
    out.push({
      name: item.name.text,
      args: argText,
      argList: extractArgList(args),
      span: { start: item.startIndex, end: item.endIndex },
    });
  }
  return out;
}

function extractArgList(args: N.AttributeArgumentsNode | undefined): string[] {
  if (!args) return [];
  return (args.children ?? []).map((v) => {
    if (v.kind === "string") {
      // Strip surrounding quotes for string args — the macro system
      // expects unquoted text.
      const t = v.text;
      if (t.length >= 2 && (t[0] === '"' || t[0] === "'")) {
        return t.slice(1, -1);
      }
      return t;
    }
    return v.text;
  });
}

function convertStruct(
  node: N.StructDeclarationNode,
  pendingAttrs: M.Attr[],
): M.StructDecl {
  const fields: M.StructField[] = [];
  for (const c of node.body.children ?? []) {
    if (c.kind !== "struct_field") continue;
    fields.push(convertStructField(c as N.StructFieldNode));
  }
  return {
    kind: "struct",
    name: node.name.text,
    exported: node.text.startsWith("export"),
    generics: node.generics?.text ?? "",
    fields,
    attrs: pendingAttrs,
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertStructField(node: N.StructFieldNode): M.StructField {
  const attrs: M.Attr[] = [];
  for (const c of node.children ?? []) {
    if (c.kind === "attribute") {
      attrs.push(...convertAttributes(c as N.AttributeNode));
    }
  }
  return {
    name: node.name.text,
    type: node.type?.text ?? "",
    optional: node.text.includes("?:"),
    attrs,
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertImpl(
  node: N.ImplDeclarationNode,
  pendingAttrs: M.Attr[],
): M.ImplDecl {
  // Grammar shape:
  //   `impl <first> [<args>] [for <target>] { … }`
  // - inherent impl: first = target struct.
  // - trait impl: first = trait name; target = struct.
  const traitName = node.target ? node.first.text : undefined;
  const targetName = node.target ? node.target.text : node.first.text;
  const traitArgs = node.trait_args?.text ?? "";

  const methods: M.ImplMethod[] = [];
  for (const m of node.body.children ?? []) {
    if (m.kind !== "impl_method") continue;
    methods.push(convertImplMethod(m as N.ImplMethodNode));
  }

  return {
    kind: "impl",
    name: targetName,
    exported: node.text.startsWith("export"),
    traitName,
    traitArgs,
    methods,
    attrs: pendingAttrs,
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertImplMethod(node: N.ImplMethodNode): M.ImplMethod {
  const attrs: M.Attr[] = [];
  for (const c of node.children ?? []) {
    if (c.kind === "attribute") {
      attrs.push(...convertAttributes(c as N.AttributeNode));
    }
  }
  // Legacy `signature` runs from the opening paren of params through the
  // end of the return type — reconstruct it from the parameters + return.
  const params = stripParens(node.parameters.text);
  const returnType = node.return_type?.text ?? "";
  const signature = returnType
    ? `${node.parameters.text}: ${returnType}`
    : node.parameters.text;
  return {
    name: node.name.text,
    signature,
    params,
    returnType,
    body: node.body.text,
    attrs,
    isAsync: node.text.startsWith("async"),
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertTrait(
  node: N.TraitDeclarationNode,
  pendingAttrs: M.Attr[],
): M.TraitDecl {
  const methods: M.TraitMethod[] = [];
  for (const m of node.body.children ?? []) {
    if (m.kind !== "trait_method") continue;
    methods.push(convertTraitMethod(m as N.TraitMethodNode));
  }
  return {
    kind: "trait",
    name: node.name.text,
    exported: node.text.startsWith("export"),
    generics: node.generics?.text ?? "",
    methods,
    attrs: pendingAttrs,
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertTraitMethod(node: N.TraitMethodNode): M.TraitMethod {
  const params = stripParens(node.parameters.text);
  const returnType = node.return_type?.text ?? "";
  const signature = returnType
    ? `${node.parameters.text}: ${returnType}`
    : node.parameters.text;
  return {
    name: node.name.text,
    signature,
    params,
    returnType,
    body: node.body?.text,
    attrs: [],
    isAsync: node.text.startsWith("async"),
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function convertFunction(
  node: N.FunctionDeclarationNode,
  pendingAttrs: M.Attr[],
): M.FunctionDecl {
  const params = stripParens(node.parameters.text);
  const returnType = node.return_type?.text ?? "";
  const signature = returnType
    ? `${node.parameters.text}: ${returnType}`
    : node.parameters.text;
  return {
    kind: "function",
    name: node.name.text,
    exported: node.text.startsWith("export"),
    signature,
    params,
    returnType,
    body: node.body.text,
    attrs: pendingAttrs,
    isAsync: node.text.includes("async"),
    span: { start: node.startIndex, end: node.endIndex },
  };
}

function stripParens(text: string): string {
  if (text.startsWith("(") && text.endsWith(")")) {
    return text.slice(1, -1);
  }
  return text;
}
