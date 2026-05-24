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
  VOID,
  display,
  equals,
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
      // `children` is typed as a single node but the adapter surfaces
      // positional children as a one-element array. Normalise to the
      // first named child either way.
      const inner = Array.isArray(ret.children)
        ? (ret.children[0] as N.AstNode | undefined)
        : (ret.children as N.AstNode | undefined);
      const valueType = inner ? walkExpr(inner, ctx, out) : VOID;
      checkReturnType(ret, valueType, ctx, out);
      return;
    }
    case "statement_block":
      // Nested block — open its own scope so locals defined inside
      // don't leak out. Mirrors the top-level entry contract.
      inferNestedBlock(node as N.StatementBlockNode, ctx, out);
      return;
    case "for_statement":
      walkForStatement(node as N.ForStatementNode, ctx, out);
      return;
    case "while_statement":
      walkWhileStatement(node as N.WhileStatementNode, ctx, out);
      return;
    case "break_statement":
    case "continue_statement":
      // Pure control-flow tokens — nothing to type.
      return;
    default:
      // Anything else (expression statements, assignments, if/match
      // appearing as a statement) — treat as an expression to record.
      walkExpr(node, ctx, out);
      return;
  }
}

/**
 * Diagnose a return whose value type doesn't match the enclosing
 * function's declared return. Off entirely when `ctx.expectedReturn`
 * is unset (expression-only callers, ad-hoc inference). `equals`
 * already waves through `any` and `unknown`, so partial inference
 * doesn't generate noise — only concrete mismatches surface.
 */
function checkReturnType(
  node: N.ReturnStatementNode,
  valueType: Type,
  ctx: InferCtx,
  out: Inferred,
): void {
  const expected = ctx.expectedReturn;
  if (!expected) return;
  if (!isConcrete(expected) || !isConcrete(valueType)) return;
  if (equals(expected, valueType)) return;
  out.diagnostics.push({
    message: `return type mismatch: expected ${display(expected)}, got ${display(valueType)}`,
    range: { start: node.startIndex, end: node.endIndex },
  });
}

/**
 * Conservative "is this a type we're willing to compare strictly"
 * predicate. Used to gate the return / let / call-arg mismatch
 * diagnostics so they only fire on unambiguous shapes. The V1
 * inference engine is lossy in several spots (range expressions
 * widen to `table`, block expressions can produce unions, etc.) —
 * complaining when either side is a union, fn, tuple, or unresolved
 * generic application would generate false positives faster than it
 * caught real bugs.
 */
function isConcrete(t: Type): boolean {
  switch (t.kind) {
    case "primitive":
      return t.name !== "any" && t.name !== "table";
    case "struct":
      return true;
    default:
      return false;
  }
}

/**
 * Walk a `for name in iterable { body }`. The loop variable's type
 * comes from the iterable: a range expression yields a number; an
 * array literal yields the inferred element type when uniform,
 * Unknown otherwise. Anything more elaborate stays Unknown — once
 * generic-application inference (Tier 3+) lands, this can read the
 * element parameter off `Vec<T>` / `Sequence<T>` types.
 */
function walkForStatement(
  node: N.ForStatementNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  const iterable = node.iterable as N.AstNode;
  walkExpr(iterable, ctx, out);
  const elementType = inferElementType(iterable, ctx);
  out.types.set(node.name.startIndex, elementType);

  ctx.env.push();
  try {
    ctx.env.define(node.name.text, { type: elementType, kind: "local" });
    for (const stmt of node.body.children ?? []) {
      walkStatement(stmt, ctx, out);
    }
  } finally {
    ctx.env.pop();
  }
}

function walkWhileStatement(
  node: N.WhileStatementNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  walkExpr(node.condition as N.AstNode, ctx, out);
  const body = node.body as N.AstNode[] | N.AstNode;
  ctx.env.push();
  try {
    if (Array.isArray(body)) {
      for (const stmt of body) walkStatement(stmt, ctx, out);
    } else if (body.kind === "statement_block") {
      for (const stmt of (body as N.StatementBlockNode).children ?? []) {
        walkStatement(stmt, ctx, out);
      }
    } else {
      walkStatement(body, ctx, out);
    }
  } finally {
    ctx.env.pop();
  }
}

function inferElementType(iterable: N.AstNode, ctx: InferCtx): Type {
  if (iterable.kind === "range_expression") {
    // Ranges always yield numbers; the existing infer-range case
    // returns the sequence type, but the loop sees scalar numbers.
    return { kind: "primitive", name: "number" };
  }
  if (iterable.kind === "array_literal") {
    const arr = iterable as N.ArrayLiteralNode;
    const items = arr.children ?? [];
    if (items.length === 0) return UNKNOWN;
    const first = inferExpression(items[0]! as N.AstNode, ctx);
    return first;
  }
  return UNKNOWN;
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
  let boundType: Type = valueType;
  if (node.type) {
    const declared = parseType(node.type.text);
    boundType = declared;
    if (
      node.value &&
      isConcrete(declared) &&
      isConcrete(valueType) &&
      !equals(declared, valueType)
    ) {
      out.diagnostics.push({
        message: `type mismatch: ${node.name.text} declared as ${display(declared)}, got ${display(valueType)}`,
        range: { start: node.startIndex, end: node.endIndex },
      });
    }
  }
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

  // The property side of a member expression is resolved by
  // `inferMemberExpression` against the object's type — recursing
  // into it as a free identifier would emit a spurious unbound
  // diagnostic for every `obj.field` site. Walk only the object.
  if (node.kind === "member_expression") {
    const mem = node as N.MemberExpressionNode;
    walkExpr(mem.object as N.AstNode, ctx, out);
    return t;
  }

  for (const child of expressionChildren(node)) {
    walkExpr(child, ctx, out);
  }

  if (node.kind === "call_expression") {
    checkCallSite(node as N.CallExpressionNode, ctx, out);
  }
  return t;
}

/**
 * Diagnose arity and per-arg type mismatches at a call site. Skips
 * when the callee resolves to anything other than a concrete `fn`
 * type — struct constructors, unknown callees, and method-table
 * placeholders fall through silently. Per-arg comparison uses
 * `equals`, which already waves through `any` and `unknown`, so
 * partial inference doesn't generate false positives.
 */
function checkCallSite(
  node: N.CallExpressionNode,
  ctx: InferCtx,
  out: Inferred,
): void {
  const calleeType = inferExpression(node.function, ctx);
  if (calleeType.kind !== "fn") return;

  const args = node.arguments?.children ?? [];
  if (args.length !== calleeType.params.length) {
    out.diagnostics.push({
      message: `wrong number of arguments: expected ${calleeType.params.length}, got ${args.length}`,
      range: { start: node.startIndex, end: node.endIndex },
    });
    return;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const param = calleeType.params[i]!;
    const argType = inferExpression(arg, ctx);
    if (
      isConcrete(param.type) &&
      isConcrete(argType) &&
      !equals(param.type, argType)
    ) {
      out.diagnostics.push({
        message: `argument ${i + 1} (${param.name}): expected ${display(param.type)}, got ${display(argType)}`,
        range: { start: arg.startIndex, end: arg.endIndex },
      });
    }
  }
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
  const scrutineeType = walkExpr(node.scrutinee as N.AstNode, ctx, out);

  const armTypes: Type[] = [];
  for (const arm of node.children) {
    armTypes.push(walkArm(arm, ctx, out));
  }
  checkExhaustiveness(node, scrutineeType, out);
  const t: Type = armTypes.length === 0
    ? UNKNOWN
    : armTypes.length === 1
      ? armTypes[0]!
      : { kind: "union", variants: dedupeVariants(armTypes) };
  out.types.set(node.startIndex, t);
  return t;
}

/**
 * Report missing variants when a `match` scrutinee resolves to a
 * struct union and the arms don't cover every member. A wildcard
 * (`_`) or bare-name binding pattern is treated as a catch-all and
 * suppresses the diagnostic. Scrutinees whose type is anything other
 * than a single struct or a union of structs are skipped — generic
 * applications, primitives, and unresolved types fall through silently
 * so the check stays additive.
 */
function checkExhaustiveness(
  node: N.MatchExpressionNode,
  scrutineeType: Type,
  out: Inferred,
): void {
  const required = collectStructVariants(scrutineeType);
  if (required.length === 0) return;

  const matched = new Set<string>();
  for (const arm of node.children) {
    const p = arm.pattern;
    if (p.kind === "wildcard_pattern" || p.kind === "binding_pattern") {
      return;
    }
    if (p.kind === "struct_pattern" && !arm.guard) {
      matched.add(p.name.text);
    }
  }

  const missing = required.filter((name) => !matched.has(name));
  if (missing.length === 0) return;

  out.diagnostics.push({
    message: `non-exhaustive match: missing ${missing.join(", ")}`,
    range: { start: node.startIndex, end: node.endIndex },
  });
}

/**
 * Pull struct names out of a scrutinee type for exhaustiveness. A
 * single struct yields a one-element list; a union of structs yields
 * each variant. Any non-struct member of the union forces a bail-out
 * (empty list) — the check only runs when every variant is a struct
 * we can name directly.
 */
function collectStructVariants(t: Type): string[] {
  if (t.kind === "struct") return [t.name];
  if (t.kind === "union") {
    const names: string[] = [];
    for (const v of t.variants) {
      if (v.kind !== "struct") return [];
      names.push(v.name);
    }
    return names;
  }
  return [];
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
