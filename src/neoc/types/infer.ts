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
 * Normalise a `TypeEnv` (legacy call style) into a full `InferCtx`.
 * Keeps sibling-agent literal / identifier / call wiring compiling
 * unchanged while member-access enjoys the richer context.
 */
function toCtx(envOrCtx: TypeEnv | InferCtx): InferCtx {
  if (envOrCtx instanceof TypeEnv) {
    return { env: envOrCtx, structs: new Map() };
  }
  return envOrCtx;
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

    // neoc-owned forms — round 3/4 implement these against the
    // existing lowering passes.
    case "match_expression":
    case "try_expression":
    case "range_expression":
    case "block_expression":
      return Type.unknown(node.kind);

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
function inferBinary(node: N.BinaryExpressionNode, ctx: InferCtx): T {
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
function inferUnary(node: N.UnaryExpressionNode, ctx: InferCtx): T {
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
function inferCall(node: N.CallExpressionNode, ctx: InferCtx): T {
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
function inferMemberExpression(node: N.MemberExpressionNode, ctx: InferCtx): T {
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

  // Instance-field path: infer the LHS, and if it resolves to a
  // struct type, walk that struct's field list for a match.
  const objectType = inferExpression(node.object, ctx);
  if (objectType.kind === "struct") {
    const decl = ctx.structs.get(objectType.name);
    if (!decl) {
      return Type.unknown(`unknown struct ${objectType.name}`);
    }
    const field = decl.fields.find((f) => f.name === propertyName);
    if (!field) {
      return Type.unknown(`no field ${propertyName} on ${objectType.name}`);
    }
    return parseType(field.type);
  }

  return Type.unknown("member_expression");
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
