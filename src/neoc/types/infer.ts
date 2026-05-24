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

import type * as N from "../ast/nodes.generated.ts";
import { Type, type Type as T, UNKNOWN, parseType, display } from "./type.ts";
import { type TypeEnv } from "./env.ts";

/**
 * Resolve the type of an expression in the given scope.
 *
 * The `node` parameter is intentionally typed as the union of every
 * expression-producing AST shape — see `nodes.generated.ts` for the
 * full list. The dispatcher falls through to `Unknown` for any node
 * kind that hasn't been wired yet.
 */
export function inferExpression(node: N.AstNode | undefined, env: TypeEnv): T {
  if (!node || typeof node !== "object") {
    return Type.unknown("missing");
  }
  switch (node.kind) {
    // Literals — round 2 implements these.
    case "number":
    case "string":
    case "template_string":
    case "boolean":
    case "null_literal":
    case "undefined_literal":
      return Type.unknown(node.kind);

    // Identifier — round 2 walks `env.lookup`.
    case "identifier":
      return Type.unknown("identifier");

    // Operators — round 2 implements binary, round 2/3 unary.
    case "binary_expression":
    case "unary_expression":
    case "ternary_expression":
      return Type.unknown(node.kind);

    // Calls + member access — round 2/3 implement struct method
    // dispatch and call return-type resolution.
    case "call_expression":
    case "member_expression":
    case "subscript_expression":
      return Type.unknown(node.kind);

    // neoc-owned forms — round 3/4 implement these against the
    // existing lowering passes.
    case "match_expression":
    case "try_expression":
    case "range_expression":
    case "block_expression":
      return Type.unknown(node.kind);

    // Parenthesised expression — strip and recurse.
    case "parenthesised_expression":
      return inferExpression(unwrapParen(node), env);

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
