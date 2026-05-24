/**
 * Expression-level inference. Walks the typed tree-sitter AST and
 * returns the `Type` of a node given a scope.
 *
 * V1 contract:
 *   - Every expression kind has a case in `inferExpression`.
 *   - Unimplemented cases return `Unknown.reason = <node.kind>` so
 *     hover / diagnostics can show "I don't yet know what this is."
 *   - No checking, no error reporting at the boundary — that lives
 *     in a separate `check` pass once the rules cover enough surface.
 *
 * Subsequent rounds add real inference for each case. The dispatcher
 * shape stays stable so parallel agents can fill in branches without
 * coordinating.
 */

import type * as M from "../ast/index.ts";
import type * as N from "../ast/nodes.generated.ts";
import {
  Type,
  type Type as T,
  UNKNOWN,
  parseType,
  display,
  NUMBER,
  STRING,
  BOOL,
  NIL,
  TABLE,
} from "./type.ts";
import { TypeEnv } from "./env.ts";

/**
 * Context carried through expression inference. Bundles the lexical
 * `env` with the module's struct table so member-access cases can
 * resolve field types without re-walking the module tree.
 *
 * Callers that don't have struct info can keep passing a bare
 * `TypeEnv`; the dispatcher normalises it into a ctx with an empty
 * struct map. Future rounds bolt extra fields (trait table, type
 * aliases, generics scope) onto this object without reshaping every
 * call site.
 */
export interface InferCtx {
  env: TypeEnv;
  structs: Map<string, M.StructDecl>;
  /**
   * Impl lookup keyed by struct name. Optional for backward
   * compatibility with callers that only need struct-field inference;
   * `toCtx` defaults a missing slot to an empty map.
   */
  impls?: Map<string, M.ImplDecl[]>;
}

/**
 * Build the struct lookup map a module needs for member-access
 * inference. One entry per top-level `struct` declaration, keyed by
 * the declared name.
 */
export function buildStructMap(module: M.Module): Map<string, M.StructDecl> {
  const out = new Map<string, M.StructDecl>();
  for (const part of module.parts) {
    if (part.kind === "struct") out.set(part.name, part);
  }
  return out;
}

/**
 * Build the impl lookup map. Keyed by the target struct name, value is
 * every `ImplDecl` (inherent or trait) that contributes methods to
 * that struct. Multiple impls per struct collapse into one list so
 * method dispatch can search a single bucket.
 */
export function buildImplMap(module: M.Module): Map<string, M.ImplDecl[]> {
  const out = new Map<string, M.ImplDecl[]>();
  for (const part of module.parts) {
    if (part.kind !== "impl") continue;
    const bucket = out.get(part.name);
    if (bucket) bucket.push(part);
    else out.set(part.name, [part]);
  }
  return out;
}

/**
 * Normalise a `TypeEnv` (legacy call style) into a full `InferCtx`.
 * Keeps sibling-agent literal / identifier / call wiring compiling
 * unchanged while member-access enjoys the richer context.
 */
interface NormalCtx {
  env: TypeEnv;
  structs: Map<string, M.StructDecl>;
  impls: Map<string, M.ImplDecl[]>;
}

function toCtx(envOrCtx: TypeEnv | InferCtx): NormalCtx {
  if (envOrCtx instanceof TypeEnv) {
    return { env: envOrCtx, structs: new Map(), impls: new Map() };
  }
  return {
    env: envOrCtx.env,
    structs: envOrCtx.structs,
    impls: envOrCtx.impls ?? new Map(),
  };
}

/**
 * Resolve the type of an expression in the given scope.
 *
 * The `node` parameter is intentionally typed as the union of every
 * expression-producing AST shape — see `nodes.generated.ts` for the
 * full list. The dispatcher falls through to `Unknown` for any node
 * kind that hasn't been wired yet.
 *
 * Accepts either a `TypeEnv` directly or a full `InferCtx`. Callers
 * that care about struct field resolution (member access) should
 * pass an `InferCtx`; everything else may keep passing the bare env.
 */
export function inferExpression(
  node: N.AstNode | undefined,
  envOrCtx: TypeEnv | InferCtx,
): T {
  const ctx = toCtx(envOrCtx);
  const env = ctx.env;
  if (!node || typeof node !== "object") {
    return Type.unknown("missing");
  }
  switch (node.kind) {
    // Literals.
    case "number":
      return NUMBER;
    case "string":
    case "template_string":
      return STRING;
    case "boolean":
      return BOOL;
    case "null_literal":
    case "undefined_literal":
      return NIL;

    // Identifier — resolve against the scope chain.
    case "identifier": {
      const entry = env.lookup(node.text);
      if (entry) return entry.type;
      return Type.unknown("unbound: " + node.text);
    }

    // Binary operators — derive result type from the operator class
    // (arithmetic / concat / comparison / logical). The grammar keeps
    // the operator as an anonymous token between the two operand
    // children, so we recover it by slicing the gap out of the node
    // text.
    case "binary_expression":
      return inferBinary(node as N.BinaryExpressionNode, ctx);

    // Unary operators — boolean negation → bool, numeric sign → number.
    // Anything else (`typeof`, `await`, `...`) stays Unknown for v1.
    case "unary_expression":
      return inferUnary(node as N.UnaryExpressionNode, ctx);

    case "ternary_expression":
      return Type.unknown(node.kind);

    // Call resolution. Look up the callee's type: a Fn yields its
    // return type, a Struct yields the struct itself (e.g. `Foo.new`),
    // anything else is Unknown for v1.
    case "call_expression":
      return inferCall(node as N.CallExpressionNode, ctx);

    // Member access `x.field` or `Foo.method`. Two flavours:
    //   - LHS is a bare identifier naming a struct in scope. The
    //     member is a struct *static*. `Struct.new` is synthesised
    //     as `fn(data: Struct) -> Struct`; anything else is Unknown
    //     until method tables land.
    //   - LHS resolves to a struct *instance* type. The member is
    //     a field lookup against the struct's declaration.
    case "member_expression":
      return inferMemberExpression(node, ctx);

    // Subscript access `x[y]`. Not inferred in V1 — index typing
    // needs array/map element-type plumbing that hasn't landed yet.
    case "subscript_expression":
      return Type.unknown("subscript_expression");

    // `match <scrut> { pat => expr, … }` — union of all arm body types,
    // each inferred with the arm's pattern bindings in scope.
    case "match_expression":
      return inferMatch(node as N.MatchExpressionNode, ctx);

    // `expr?` — the `Result<T, E>` unwrap. We can't see the generics
    // yet (parseType collapses `Result<T, E>` to Unknown), so report
    // the limitation verbatim. When generics inference lands, the
    // inner expression's type will carry T and this case improves.
    case "try_expression":
      return Type.unknown("try: opaque Result");

    // Range expression `a..b` / `a..=b`. The lowering wraps an IIFE
    // that produces a Lua sequence table; the resulting value is
    // always a table of numbers.
    case "range_expression":
      return TABLE;

    // Block expression `{ stmt; stmt; final }`. The block's type is
    // the type of its `final` expression. Statement-level scoping
    // (let bindings inside the block) is the walker's job; this case
    // only types the value the block evaluates to.
    case "block_expression":
      return inferExpression((node as N.BlockExpressionNode).final, ctx);

    // Parenthesised expression — strip and recurse.
    case "parenthesised_expression":
      return inferExpression(unwrapParen(node), ctx);

    // Object / array literals + arrow functions — round 3.
    case "object_literal":
    case "array_literal":
    case "arrow_function":
      return Type.unknown(node.kind);

    // Assignment is statement-shaped; type is `void` once we wire it.
    case "assignment_expression":
      return Type.unknown("assignment_expression");

    default:
      return Type.unknown(node.kind ?? "unknown_node");
  }
}

/**
 * Recover the operator token of a binary expression. The grammar
 * stores the operator as an anonymous token between the two operand
 * children, which the typed-AST walker drops on the floor. We slice
 * it back out of the node's verbatim text.
 */
function binaryOperator(node: N.BinaryExpressionNode): string {
  const kids = (node as unknown as { children?: N.AstNode[] }).children ?? [];
  if (kids.length < 2) return "";
  const left = kids[0]!;
  const right = kids[1]!;
  const start = left.endIndex - node.startIndex;
  const end = right.startIndex - node.startIndex;
  return node.text.slice(start, end).trim();
}

/**
 * Recover the prefix operator of a unary expression by reading the
 * source between the node's start and its single operand's start.
 */
function unaryOperator(node: N.UnaryExpressionNode): string {
  const kids = (node as unknown as { children?: N.AstNode[] }).children;
  const operand = Array.isArray(kids) ? kids[0] : kids;
  if (!operand) return "";
  const end = operand.startIndex - node.startIndex;
  return node.text.slice(0, end).trim();
}

/**
 * Result type of a binary expression. Arithmetic operators evaluate
 * to `number`, comparison operators to `bool`, and short-circuit
 * logicals to the union of their operand types (Lua-style `a or b`
 * returns whichever side wins). Operand types only matter for the
 * logical case — V1 reports no type errors at the boundary.
 */
function inferBinary(node: N.BinaryExpressionNode, ctx: NormalCtx): T {
  const op = binaryOperator(node);
  const kids = (node as unknown as { children?: N.AstNode[] }).children ?? [];
  switch (op) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "^":
      return NUMBER;
    case "..":
      return STRING;
    case "==":
    case "!=":
    case "===":
    case "!==":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return BOOL;
    case "&&":
    case "||":
    case "??":
    case "and":
    case "or": {
      const left = inferExpression(kids[0], ctx);
      const right = inferExpression(kids[1], ctx);
      return Type.union([left, right]);
    }
    default:
      return Type.unknown("binary_expression");
  }
}

/**
 * Result type of a unary expression. Boolean negation yields `bool`,
 * sign / bitwise / length operators yield `number`. Anything else
 * (`typeof`, `await`, `...`) is Unknown until those forms get real
 * inference rules.
 */
function inferUnary(node: N.UnaryExpressionNode, ctx: NormalCtx): T {
  const op = unaryOperator(node);
  void ctx; // inner operand type doesn't influence the result for V1
  switch (op) {
    case "!":
    case "not":
      return BOOL;
    case "-":
    case "+":
    case "~":
    case "#":
      return NUMBER;
    default:
      return Type.unknown("unary_expression");
  }
}

/**
 * Result type of a call expression. Walks the callee:
 *   - `Fn` → return type
 *   - `Struct` → the struct itself (covers the synthesised
 *     `Struct.new` constructor surfaced by `inferMemberExpression`)
 * Anything else stays Unknown.
 */
function inferCall(node: N.CallExpressionNode, ctx: NormalCtx): T {
  const calleeType = inferExpression(node.function, ctx);
  if (calleeType.kind === "fn") return calleeType.ret;
  if (calleeType.kind === "struct") return calleeType;
  return Type.unknown("call_expression");
}

/**
 * Type of a `member_expression`. Resolves either as a struct static
 * (e.g. `Product.new`) or as a struct instance field (e.g.
 * `instance.id`). Anything that doesn't fit either shape is Unknown
 * with a reason string suitable for hover / diagnostics.
 */
function inferMemberExpression(node: N.MemberExpressionNode, ctx: NormalCtx): T {
  const propertyName = node.property.text;

  // Struct-static path: the LHS is a bare identifier whose scope
  // entry is `kind: "struct"`. Synthesise `Struct.new` on the fly.
  if (node.object.kind === "identifier") {
    const entry = ctx.env.lookup(node.object.text);
    if (entry && entry.kind === "struct") {
      const structName = node.object.text;
      if (propertyName === "new") {
        return Type.fn(
          [{ name: "data", type: Type.struct(structName) }],
          Type.struct(structName),
        );
      }
      // Other statics (associated fns, trait methods) wait for the
      // round that wires impl-method tables into the type env.
      return Type.unknown(`no static ${propertyName} on ${structName}`);
    }
  }

  // Instance path: infer the LHS, and if it resolves to a struct
  // type, look for a matching field first, then fall back to the
  // struct's impl methods.
  const objectType = inferExpression(node.object, ctx);
  if (objectType.kind === "struct") {
    const decl = ctx.structs.get(objectType.name);
    if (!decl) {
      return Type.unknown(`unknown struct ${objectType.name}`);
    }
    const field = decl.fields.find((f) => f.name === propertyName);
    if (field) return parseType(field.type);
    const method = findMethod(ctx, objectType.name, propertyName);
    if (method) return methodFnType(method);
    // No matching field. If the struct has an impl block we treat the
    // miss as a method-dispatch failure (the user clearly reached for
    // a method); otherwise it's a plain field-lookup failure.
    const hasImpls = ctx.impls.has(objectType.name);
    const noun = hasImpls ? "method" : "field";
    return Type.unknown(`no ${noun} ${propertyName} on ${objectType.name}`);
  }

  return Type.unknown("member_expression");
}

/**
 * Search every impl bucket targeting `structName` for a method named
 * `methodName`. Both inherent and trait impls contribute; the first
 * match wins.
 */
function findMethod(
  ctx: NormalCtx,
  structName: string,
  methodName: string,
): M.ImplMethod | undefined {
  const impls = ctx.impls.get(structName);
  if (!impls) return undefined;
  for (const impl of impls) {
    const hit = impl.methods.find((m) => m.name === methodName);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Build a `FnType` from an `ImplMethod`. The adapter stores params
 * and return type as verbatim source text; we parse them through the
 * same helpers `buildModuleScope` uses for free functions.
 */
function methodFnType(method: M.ImplMethod): T {
  const params = splitMethodParams(method.params).map((p) => ({
    name: p.name,
    type: parseType(p.type),
  }));
  return Type.fn(params, parseType(method.returnType));
}

function splitMethodParams(text: string): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if ((c === "," && depth === 0) || i === text.length) {
      const chunk = text.slice(start, i).trim();
      if (chunk.length > 0) out.push(parseMethodParam(chunk));
      start = i + 1;
    }
  }
  return out;
}

function parseMethodParam(text: string): { name: string; type: string } {
  const colon = text.indexOf(":");
  if (colon < 0) return { name: text.trim(), type: "" };
  return {
    name: text.slice(0, colon).trim().replace(/[?].*$/, ""),
    type: text.slice(colon + 1).trim(),
  };
}

/**
 * Result type of a `match_expression`. Each arm is inferred with the
 * pattern's bindings in scope; the overall type is the union of every
 * arm's body type. Returns `Unknown` when the node has no arms.
 *
 * Pattern binding rules:
 *   - `wildcard_pattern` / `literal_pattern` introduce no bindings.
 *   - `binding_pattern` binds its identifier to the scrutinee's type.
 *   - `struct_pattern` `Foo { f1, f2 }` binds each named field to the
 *     declared field type drawn from `ctx.structs.get("Foo")`. The
 *     bindings cover the three body shapes the grammar produces:
 *       `pattern_shorthand`   →  binds `name` to field `name`'s type
 *       `pattern_bind`        →  binds `binding` to field `key`'s type
 *       `pattern_check`       →  no binding (literal value match)
 *   - `object_pattern` follows the same binding rules but without a
 *     struct name; the binding type stays `Unknown` since we can't
 *     infer field types without a declaration to consult.
 */
function inferMatch(node: N.MatchExpressionNode, ctx: NormalCtx): T {
  const arms = (node.children ?? []).filter(
    (c) => c.kind === "match_arm",
  ) as N.MatchArmNode[];
  if (arms.length === 0) return Type.unknown("match: no arms");

  const scrutineeType = inferExpression(node.scrutinee, ctx);
  const armTypes: T[] = [];
  for (const arm of arms) {
    armTypes.push(inferMatchArm(arm, scrutineeType, ctx));
  }
  return Type.union(armTypes);
}

/**
 * Infer one match arm's body with its pattern bindings in scope.
 * Always pops the pushed scope, even when the body inference throws.
 */
function inferMatchArm(
  arm: N.MatchArmNode,
  scrutineeType: T,
  ctx: NormalCtx,
): T {
  ctx.env.push();
  try {
    bindPattern(arm.pattern, scrutineeType, ctx);
    return inferExpression(arm.body, ctx);
  } finally {
    ctx.env.pop();
  }
}

/**
 * Walk a pattern and define every binding it introduces on the current
 * scope. The scrutinee's type seeds bindings whose source is the
 * matched value itself (e.g. `binding_pattern`).
 */
function bindPattern(
  pattern: N.MatchArmNode["pattern"],
  scrutineeType: T,
  ctx: NormalCtx,
): void {
  switch (pattern.kind) {
    case "wildcard_pattern":
    case "literal_pattern":
      return;

    case "binding_pattern":
      ctx.env.define(pattern.text, { type: scrutineeType, kind: "local" });
      return;

    case "struct_pattern": {
      const decl = ctx.structs.get(pattern.name.text);
      if (!pattern.body) return;
      for (const entry of pattern.body.children) {
        bindPatternEntry(entry, decl, ctx);
      }
      return;
    }

    case "object_pattern": {
      // `object_pattern.children` is a single `PatternBodyNode`, but
      // some adapters surface it as an array — handle both.
      const raw = (pattern as unknown as { children?: unknown }).children;
      const body = Array.isArray(raw) ? raw[0] as N.PatternBodyNode | undefined
        : (raw as N.PatternBodyNode | undefined);
      if (!body) return;
      for (const entry of body.children) {
        bindPatternEntry(entry, undefined, ctx);
      }
      return;
    }
  }
}

/**
 * Define one pattern-body entry on the current scope. `decl` is the
 * matched struct's declaration when known; without one the binding
 * type stays `Unknown` so the name is still visible.
 */
function bindPatternEntry(
  entry: N.PatternBindNode | N.PatternCheckNode | N.PatternShorthandNode,
  decl: M.StructDecl | undefined,
  ctx: NormalCtx,
): void {
  if (entry.kind === "pattern_check") return; // value check, no bind

  // `pattern_shorthand` is the bare-identifier case: the binding name
  // matches the field name. The generated type lists `children` as a
  // single `IdentifierNode`, but the walker materialises it as an
  // array; `entry.text` is the safe source of truth either way.
  const fieldName =
    entry.kind === "pattern_shorthand" ? entry.text : entry.key.text;
  const bindingName =
    entry.kind === "pattern_shorthand" ? entry.text : entry.binding.text;

  let type: T;
  if (!decl) {
    type = Type.unknown(`pattern field: ${fieldName}`);
  } else {
    const field = decl.fields.find((f) => f.name === fieldName);
    type = field
      ? parseType(field.type)
      : Type.unknown(`no field ${fieldName} on ${decl.name}`);
  }
  ctx.env.define(bindingName, { type, kind: "local" });
}

/**
 * Resolve an expression by walking through any wrapping
 * `parenthesised_expression` nodes. Useful for callers who care
 * about the inner shape (e.g. method-call vs free call resolution).
 */
function unwrapParen(node: N.ParenthesisedExpressionNode): N.AstNode | undefined {
  // The generated interface holds the inner expression as a positional
  // child; the parser only ever produces one. Walk children for the
  // first named one and return it.
  const children = (node as unknown as { children?: N.AstNode[] }).children;
  if (!children) return undefined;
  return children[0];
}

// ----------------------------------------------------------------------------
// Diagnostics carrier (so rounds 2+ can accumulate without redesigning)
// ----------------------------------------------------------------------------

export interface TypeDiagnostic {
  message: string;
  /** byte offsets into the source */
  range: { start: number; end: number };
}

export class DiagnosticBag {
  private readonly items: TypeDiagnostic[] = [];

  push(msg: string, node: { startIndex: number; endIndex: number }): void {
    this.items.push({
      message: msg,
      range: { start: node.startIndex, end: node.endIndex },
    });
  }

  toArray(): readonly TypeDiagnostic[] {
    return this.items;
  }
}

// ----------------------------------------------------------------------------
// Re-exports so consumers only need one import path.
// ----------------------------------------------------------------------------

export { display, parseType, UNKNOWN } from "./type.ts";
export type { Type } from "./type.ts";
