/**
 * Statement-level walker that promotes expression-level inference into
 * a module-wide map of identifier positions to inferred `Type`s.
 *
 * Where `inferExpression` answers "what is this one node's type?",
 * `inferBody` answers "as I walk the body in source order, what does
 * every named identifier site resolve to?". It opens a fresh scope at
 * the body start, binds locals introduced by `let`, descends into
 * nested expression children to record their types, and pops the
 * scope on return. The output is keyed by `startIndex` so hover /
 * diagnostic consumers can look up a position directly.
 */

import type * as M from "../ast/index.ts";
import type * as N from "../ast/nodes.generated.ts";
import {
  type Type,
  parseType,
  UNKNOWN,
} from "./type.ts";
import { inferExpression, type InferCtx, type TypeDiagnostic } from "./infer.ts";

/**
 * Result of walking a function or method body.
 *
 * `types` maps an AST node's byte offset (`startIndex`) to the type
 * the walker observed at that position. Keys cover:
 *   - Identifier references inside expressions.
 *   - `let` binding names (the identifier introduced by the
 *     declaration, not its right-hand side).
 *   - Names bound by match-arm struct patterns.
 *
 * `diagnostics` collects soft errors (unbound identifiers, missing
 * struct declarations) accumulated during the walk.
 */
export interface Inferred {
  types: Map<number, Type>;
  diagnostics: TypeDiagnostic[];
}

/**
 * Walk a function or method body, recording the inferred type at
 * every identifier site and binding any locals introduced by `let`
 * statements into the active scope.
 *
 * @param body - The `statement_block` node representing the body. The
 *   walker assumes the caller has already pushed any per-function
 *   scope (e.g. parameters); it opens its own nested scope on entry
 *   and pops it on return.
 * @param ctx - Shared inference context. The walker pushes / pops
 *   scopes on `ctx.env`; on return the env is left exactly as it was
 *   passed in.
 */
export function inferBody(body: N.StatementBlockNode, ctx: InferCtx): Inferred {
  const out: Inferred = { types: new Map(), diagnostics: [] };
  ctx.env.push();
  try {
    for (const stmt of body.children) {
      walkStatement(stmt, ctx, out);
    }
  } finally {
    ctx.env.pop();
  }
  return out;
}

// ----------------------------------------------------------------------------
// Statement dispatch
// ----------------------------------------------------------------------------

function walkStatement(node: N.AstNode, ctx: InferCtx, out: Inferred): void {
  switch (node.kind) {
    case "variable_declaration":
      walkVariableDeclaration(node as N.VariableDeclarationNode, ctx, out);
      return;
    case "return_statement": {
      const ret = node as N.ReturnStatementNode;
      if (ret.children) walkExpr(ret.children as N.AstNode, ctx, out);
      return;
    }
    case "statement_block":
      // Nested block — open its own scope so locals defined inside
      // don't leak out. Mirrors the top-level entry contract.
      inferNestedBlock(node as N.StatementBlockNode, ctx, out);
      return;
    default:
      // Anything else (expression statements, assignments, if/match
      // appearing as a statement) — treat as an expression to record.
      walkExpr(node, ctx, out);
      return;
  }
}

function walkVariableDeclaration(
  node: N.VariableDeclarationNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  // Infer the right-hand side first so the binding's recorded type
  // matches the value expression. An annotated `let x: T = expr`
  // wins over inference — the annotation is the user's intent.
  const valueType = node.value ? walkExpr(node.value as N.AstNode, ctx, out) : UNKNOWN;
  const boundType = node.type ? parseType(node.type.text) : valueType;
  out.types.set(node.name.startIndex, boundType);
  ctx.env.define(node.name.text, { type: boundType, kind: "local" });
}

function inferNestedBlock(
  block: N.StatementBlockNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  ctx.env.push();
  try {
    for (const stmt of block.children) walkStatement(stmt, ctx, out);
  } finally {
    ctx.env.pop();
  }
}

// ----------------------------------------------------------------------------
// Expression walking
// ----------------------------------------------------------------------------

/**
 * Infer an expression, record its type at the node's `startIndex`,
 * and recurse into nested expression children so every identifier
 * site picks up its own entry. Returns the inferred type so callers
 * (notably `let`) can reuse it.
 */
function walkExpr(node: N.AstNode, ctx: InferCtx, out: Inferred): Type {
  // Match expressions need scope handling per arm — bypass the
  // generic recursion below and dispatch into the dedicated walker.
  if (node.kind === "match_expression") {
    return walkMatch(node as N.MatchExpressionNode, ctx, out);
  }

  const t = inferExpression(node, ctx);
  out.types.set(node.startIndex, t);

  if (node.kind === "identifier") {
    if (t.kind === "unknown" && typeof t.reason === "string" && t.reason.startsWith("unbound:")) {
      out.diagnostics.push({
        message: t.reason,
        range: { start: node.startIndex, end: node.endIndex },
      });
    }
    return t;
  }

  for (const child of expressionChildren(node)) {
    walkExpr(child, ctx, out);
  }
  return t;
}

/**
 * Enumerate the nested expression children of `node` that the walker
 * should recurse into. We hand-roll this rather than calling a
 * generic descent so we can skip over non-expression slots (type
 * annotations, patterns, etc.) that share the same parent shape.
 */
function expressionChildren(node: N.AstNode): N.AstNode[] {
  const bag = node as unknown as Record<string, unknown>;
  const out: N.AstNode[] = [];
  for (const key of Object.keys(bag)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = bag[key];
    if (Array.isArray(v)) {
      for (const child of v) {
        if (isExpressionLike(child)) out.push(child as N.AstNode);
      }
    } else if (isExpressionLike(v)) {
      out.push(v as N.AstNode);
    }
  }
  return out;
}

/** Object keys on AST nodes that never carry expression children. */
const SKIP_KEYS = new Set([
  "kind",
  "text",
  "startIndex",
  "endIndex",
  "startPosition",
  "endPosition",
  "type",
]);

/**
 * Heuristic: any object with a string `kind` field is an AST node,
 * and any AST node may carry an expression we want to record. The
 * dispatcher in `inferExpression` returns `Unknown` for non-expression
 * shapes (type annotations, identifiers used as field names), so the
 * recorded entries stay harmless even if they slip through.
 */
function isExpressionLike(v: unknown): boolean {
  return !!v && typeof v === "object" && typeof (v as { kind?: unknown }).kind === "string";
}

// ----------------------------------------------------------------------------
// Match arms with pattern-introduced bindings
// ----------------------------------------------------------------------------

/**
 * Walk a `match_expression`, opening a per-arm sub-scope for any
 * names introduced by a struct pattern so the arm body sees the
 * bindings with the right field types.
 *
 * The arm contract:
 *   - `Foo { x }` (`pattern_shorthand`) binds `x` to the type of
 *     `Foo.x` looked up via `ctx.structs`.
 *   - `Foo { x: y }` (`pattern_bind`) binds `y` to the type of
 *     `Foo.x`, and we also record the LHS key's identifier as the
 *     field's type so hover over the key works.
 *   - Patterns without a struct context, or that reference a struct
 *     we can't resolve, bind names as `Unknown`.
 */
function walkMatch(
  node: N.MatchExpressionNode,
  ctx: InferCtx,
  out: Inferred,
): Type {
  // Don't dispatch through `inferExpression` for the match node
  // itself — its overall type is the union of its arm bodies, and
  // we compute that below by walking each arm in its own scope.
  walkExpr(node.scrutinee as N.AstNode, ctx, out);

  const armTypes: Type[] = [];
  for (const arm of node.children) {
    armTypes.push(walkArm(arm, ctx, out));
  }
  const t: Type = armTypes.length === 0
    ? UNKNOWN
    : armTypes.length === 1
      ? armTypes[0]!
      : { kind: "union", variants: dedupeVariants(armTypes) };
  out.types.set(node.startIndex, t);
  return t;
}

/**
 * Drop structurally duplicate variants from a union. Mirrors the
 * dedupe `Type.union` would apply if we could call it here without
 * pulling the constructor surface into the walker.
 */
function dedupeVariants(types: Type[]): Type[] {
  const seen = new Map<string, Type>();
  for (const t of types) seen.set(JSON.stringify(t), t);
  return [...seen.values()];
}

function walkArm(arm: N.MatchArmNode, ctx: InferCtx, out: Inferred): Type {
  ctx.env.push();
  try {
    bindPattern(arm.pattern, ctx, out);
    if (arm.guard) walkExpr(arm.guard as N.AstNode, ctx, out);
    return walkExpr(arm.body as N.AstNode, ctx, out);
  } finally {
    ctx.env.pop();
  }
}

/**
 * Introduce any names a match pattern binds into the active scope.
 * Only struct patterns introduce names worth recording for V1;
 * binding / object / literal / wildcard patterns either bind a
 * single name with no struct context or bind nothing at all.
 */
function bindPattern(
  pattern: N.MatchArmNode["pattern"],
  ctx: InferCtx,
  out: Inferred,
): void {
  switch (pattern.kind) {
    case "struct_pattern":
      bindStructPattern(pattern as N.StructPatternNode, ctx, out);
      return;
    case "binding_pattern": {
      // `let-style` binding pattern — a single identifier with no
      // type information. Record + bind as Unknown.
      const ident = findFirstIdentifier(pattern);
      if (ident) {
        out.types.set(ident.startIndex, UNKNOWN);
        ctx.env.define(ident.text, { type: UNKNOWN, kind: "local" });
      }
      return;
    }
    case "object_pattern":
    case "literal_pattern":
    case "wildcard_pattern":
    default:
      return;
  }
}

function bindStructPattern(
  pattern: N.StructPatternNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  const structName = pattern.name.text;
  const decl: M.StructDecl | undefined = ctx.structs.get(structName);
  out.types.set(pattern.name.startIndex, decl ? { kind: "struct", name: structName } : UNKNOWN);
  if (!pattern.body) return;

  for (const entry of pattern.body.children) {
    switch (entry.kind) {
      case "pattern_shorthand": {
        // `children` is typed as a single identifier in the generated
        // shapes, but the tree-sitter adapter actually surfaces it as
        // a one-element array under `children`. Walk that uniformly.
        const ident = findFirstIdentifier(entry);
        if (!ident) break;
        const fieldType = lookupFieldType(decl, ident.text);
        out.types.set(ident.startIndex, fieldType);
        ctx.env.define(ident.text, { type: fieldType, kind: "local" });
        break;
      }
      case "pattern_bind": {
        const pb = entry as N.PatternBindNode;
        const fieldType = lookupFieldType(decl, pb.key.text);
        out.types.set(pb.key.startIndex, fieldType);
        out.types.set(pb.binding.startIndex, fieldType);
        ctx.env.define(pb.binding.text, { type: fieldType, kind: "local" });
        break;
      }
      case "pattern_check":
        // Field equality check — no binding introduced. Record the
        // checked key as the field's type for hover convenience.
        out.types.set(entry.key.startIndex, lookupFieldType(decl, entry.key.text));
        break;
    }
  }
}

function lookupFieldType(decl: M.StructDecl | undefined, fieldName: string): Type {
  if (!decl) return UNKNOWN;
  const field = decl.fields.find((f) => f.name === fieldName);
  if (!field) return UNKNOWN;
  return parseType(field.type);
}

/**
 * Walk a node and return the first descendant identifier. Used to
 * recover the single name a `binding_pattern` introduces without
 * caring about the surrounding wrapper shape.
 */
function findFirstIdentifier(root: unknown): N.IdentifierNode | undefined {
  if (!root || typeof root !== "object") return undefined;
  const bag = root as Record<string, unknown> & { kind?: unknown };
  if (bag.kind === "identifier") return root as N.IdentifierNode;
  for (const key of Object.keys(bag)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = bag[key];
    if (Array.isArray(v)) {
      for (const child of v) {
        const hit = findFirstIdentifier(child);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = findFirstIdentifier(v);
      if (hit) return hit;
    }
  }
  return undefined;
}
