/**
 * AST-driven Lua emitter for neoc function bodies.
 *
 * Walks a `statement_block` and produces the Lua text the codegen
 * staples into `function ... end`. Replaces the splice-based
 * `lowerAll` pipeline: every translation that used to happen via
 * regex/splice now happens by recognising the AST node and emitting
 * the corresponding Lua.
 *
 * The emitter is intentionally incomplete — neoc has ~90 grammar
 * nodes and only a fraction land in function bodies. Anything we
 * don't recognise falls back to the node's verbatim `.text`, which
 * is fine for identifiers, literals, and Lua-shaped constructs the
 * grammar tolerates verbatim.
 *
 * Existing render helpers from `lower-block`, `lower-match`,
 * `lower-range`, and `lower-try` stay the source of truth for their
 * respective lowerings — the emitter delegates to them.
 */
import type * as N from "../ast/nodes.generated.ts";
import { renderBlockAsIife } from "./lower-block.ts";
import { renderMatchAsIife } from "./lower-match.ts";
import { renderRangeAsIife } from "./lower-range.ts";

const INDENT = "  ";

export function emitLuaBody(body: N.StatementBlockNode): string {
  const lines: string[] = [];
  for (const stmt of body.children ?? []) {
    const text = emitStatement(stmt);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function emitStatement(node: N.AstNode): string {
  switch (node.kind) {
    case "variable_declaration":
      return emitVarDecl(node as N.VariableDeclarationNode);
    case "if_statement":
      return emitIf(node as N.IfStatementNode);
    case "return_statement":
      return emitReturn(node as N.ReturnStatementNode);
    case "statement_block":
      return emitInnerBlock(node as N.StatementBlockNode);
    default:
      // Expression-position statements (call_expression, assignment_expression,
      // bare try_expression, etc.). Most are valid Lua expression
      // statements once their sub-expressions are emitted.
      if (node.kind === "try_expression") {
        return emitTryStatement(node as N.TryExpressionNode);
      }
      return emitExpression(node);
  }
}

function emitVarDecl(node: N.VariableDeclarationNode): string {
  const name = node.name.text;
  if (!node.value) return `local ${name}`;
  if (node.value.kind === "try_expression") {
    return emitTryAsLet(name, node.value as N.TryExpressionNode);
  }
  return `local ${name} = ${emitExpression(node.value as N.AstNode)}`;
}

/**
 * Emit an `if (cond) cons (else alt)?` statement as Lua
 * `if cond then ... else ... end`. Collapses `else if (...)` into
 * `elseif` so the chain reads naturally.
 */
function emitIf(node: N.IfStatementNode): string {
  const lines: string[] = [];
  emitIfChain(node, lines);
  lines.push("end");
  return lines.join("\n");
}

function emitIfChain(node: N.IfStatementNode, out: string[]): void {
  const cond = emitExpression(node.condition);
  const cons = emitBranch(node.consequence as N.AstNode[] | N.AstNode);
  out.push(`if ${cond} then`);
  out.push(indent(cons));
  if (!node.alternative) return;
  const alt = node.alternative as N.AstNode[] | N.AstNode;
  const altNode = Array.isArray(alt) ? alt[0]! : alt;
  // `else if (...)` chains land as a single alternative whose first
  // (only) element is another if_statement — collapse into `elseif`.
  if (altNode && altNode.kind === "if_statement") {
    const inner = altNode as N.IfStatementNode;
    const innerCond = emitExpression(inner.condition);
    const innerCons = emitBranch(inner.consequence as N.AstNode[] | N.AstNode);
    out.push(`elseif ${innerCond} then`);
    out.push(indent(innerCons));
    if (inner.alternative) {
      // Recurse on the inner alternative's chain. Use a transient
      // wrapper: re-emit by extracting the inner's alternative as
      // the new "alternative" of the current `if`.
      emitElseTail(inner.alternative as N.AstNode[] | N.AstNode, out);
    }
    return;
  }
  emitElseTail(alt, out);
}

function emitElseTail(alt: N.AstNode[] | N.AstNode, out: string[]): void {
  const altNode = Array.isArray(alt) ? alt[0]! : alt;
  if (altNode && altNode.kind === "if_statement") {
    const inner = altNode as N.IfStatementNode;
    const innerCond = emitExpression(inner.condition);
    const innerCons = emitBranch(inner.consequence as N.AstNode[] | N.AstNode);
    out.push(`elseif ${innerCond} then`);
    out.push(indent(innerCons));
    if (inner.alternative) {
      emitElseTail(inner.alternative as N.AstNode[] | N.AstNode, out);
    }
    return;
  }
  out.push("else");
  out.push(indent(emitBranch(alt)));
}

/**
 * Emit the body of an if branch or other compound consequence. The
 * grammar exposes `consequence` / `alternative` as either a single
 * node (when wrapped in a `statement_block`) or as a small array of
 * statements when not. Both cases collapse to a multi-line emission.
 */
function emitBranch(branch: N.AstNode[] | N.AstNode | undefined): string {
  if (!branch) return "";
  if (Array.isArray(branch)) {
    return branch.map((s) => emitStatement(s)).filter(Boolean).join("\n");
  }
  if (branch.kind === "statement_block") {
    return emitInnerBlock(branch as N.StatementBlockNode);
  }
  return emitStatement(branch);
}

function emitInnerBlock(block: N.StatementBlockNode): string {
  const lines: string[] = [];
  for (const stmt of block.children ?? []) {
    const text = emitStatement(stmt);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

function emitReturn(node: N.ReturnStatementNode): string {
  // `children` is typed as a single node but tree-sitter's
  // positional-children walker surfaces it as a one-element array.
  // Normalise to the first expression child either way.
  const raw = (node as unknown as { children?: N.AstNode | N.AstNode[] }).children;
  const inner = Array.isArray(raw) ? raw[0] : raw;
  if (!inner) return "return";
  return `return ${emitExpression(inner)}`;
}

// ---------------------------------------------------------------------------
// Try expression at statement / let-binding position
// ---------------------------------------------------------------------------

let tryCounter = 0;
function freshTryName(): string {
  const name = tryCounter === 0 ? "__r" : `__r_${tryCounter}`;
  tryCounter++;
  return name;
}

function emitTryAsLet(varName: string, tryNode: N.TryExpressionNode): string {
  const inner = innerOfTry(tryNode);
  const tmp = freshTryName();
  return [
    `local ${tmp} = ${inner}`,
    `if not ${tmp}.ok then return ${tmp} end`,
    `local ${varName} = ${tmp}.value`,
  ].join("\n");
}

function emitTryStatement(tryNode: N.TryExpressionNode): string {
  const inner = innerOfTry(tryNode);
  const tmp = freshTryName();
  return [
    `local ${tmp} = ${inner}`,
    `if not ${tmp}.ok then return ${tmp} end`,
  ].join("\n");
}

function innerOfTry(node: N.TryExpressionNode): string {
  const children = (node as unknown as { children?: N.AstNode[] }).children;
  const inner = children?.[0];
  if (inner) return emitExpression(inner);
  // Fallback: strip the trailing `?`.
  return node.text.replace(/\?\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function emitExpression(node: N.AstNode | undefined): string {
  if (!node) return "";
  switch (node.kind) {
    case "binary_expression":
      return emitBinary(node as N.BinaryExpressionNode);
    case "unary_expression":
      return emitUnary(node as N.UnaryExpressionNode);
    case "call_expression":
      return emitCall(node as N.CallExpressionNode);
    case "member_expression":
      return emitMember(node as N.MemberExpressionNode);
    case "subscript_expression":
      return emitSubscript(node as N.SubscriptExpressionNode);
    case "object_literal":
      return emitObjectLiteral(node as N.ObjectLiteralNode);
    case "array_literal":
      return emitArrayLiteral(node as N.ArrayLiteralNode);
    case "parenthesised_expression":
      return `(${emitExpression(firstChildExpr(node))})`;
    case "block_expression":
      return renderBlockAsIife(node as N.BlockExpressionNode);
    case "match_expression":
      return renderMatchAsIife(node as N.MatchExpressionNode);
    case "range_expression": {
      const r = node as N.RangeExpressionNode;
      // The grammar reuses `range_expression` for `0..3` numeric
      // ranges AND for Lua-style string concat `"a" .. b`. When one
      // operand is a string-like expression, emit a bare `..` op
      // instead of the sequence-building IIFE.
      if (isStringy(r.start) || isStringy(r.end)) {
        return `${emitExpression(r.start as N.AstNode)} .. ${emitExpression(r.end as N.AstNode)}`;
      }
      return renderRangeAsIife(r);
    }
    case "try_expression":
      // At a non-statement expression position, `?` can't lower
      // cleanly to Lua. Punt and emit verbatim; the user should
      // promote it to a `let` first (and the type checker will
      // flag the resulting Unknown).
      return node.text;
    case "ternary_expression":
      return emitTernary(node as N.TernaryExpressionNode);
    case "assignment_expression":
      return emitAssignment(node as N.AssignmentExpressionNode);
    case "template_string":
      return emitTemplateString(node as N.TemplateStringNode);
    case "arrow_function":
      return emitArrowFunction(node as N.ArrowFunctionNode);
    case "null_literal":
    case "undefined_literal":
      return "nil";
    case "boolean":
    case "number":
    case "string":
    case "identifier":
      return node.text;
    default:
      // Unknown shape — verbatim is the safest fallback. Most
      // remaining grammar nodes that show up in body expressions
      // (identifiers, structured patterns, etc.) already emit Lua-
      // compatible text.
      return node.text;
  }
}

function emitBinary(node: N.BinaryExpressionNode): string {
  const kids = node.children ?? [];
  if (kids.length !== 2) return node.text;
  const [lhs, rhs] = kids;
  const lhsText = emitExpression(lhs as N.AstNode);
  const rhsText = emitExpression(rhs as N.AstNode);
  const op = operatorBetween(node, lhs as N.AstNode, rhs as N.AstNode);
  return `${lhsText} ${translateBinaryOp(op)} ${rhsText}`;
}

function operatorBetween(parent: N.NodeBase, lhs: N.NodeBase, rhs: N.NodeBase): string {
  const start = lhs.endIndex - parent.startIndex;
  const end = rhs.startIndex - parent.startIndex;
  return parent.text.slice(start, end).trim();
}

function translateBinaryOp(op: string): string {
  switch (op) {
    case "||": return "or";
    case "&&": return "and";
    case "??": return "or"; // closest Lua equivalent
    case "!=":
    case "!==": return "~=";
    case "===": return "==";
    default: return op;
  }
}

function emitUnary(node: N.UnaryExpressionNode): string {
  const operand = (node as unknown as { argument?: N.AstNode; operand?: N.AstNode }).argument
    ?? (node as unknown as { operand?: N.AstNode }).operand;
  const inner = operand ?? firstChildExpr(node);
  const innerText = emitExpression(inner);
  // The leading characters up to the operand are the operator(s).
  const opEnd = (inner?.startIndex ?? node.endIndex) - node.startIndex;
  const op = node.text.slice(0, opEnd).trim();
  return `${translateUnaryOp(op)}${needsUnarySpace(op) ? " " : ""}${innerText}`;
}

function translateUnaryOp(op: string): string {
  if (op === "!") return "not";
  return op; // `-`, `+`, etc.
}

function needsUnarySpace(op: string): boolean {
  return op === "!" || op === "not";
}

function emitCall(node: N.CallExpressionNode): string {
  const callee = emitExpression(node.function as N.AstNode);
  const args = (node.arguments?.children ?? [])
    .map((a) => emitExpression(a as N.AstNode))
    .join(", ");
  return `${callee}(${args})`;
}

function emitMember(node: N.MemberExpressionNode): string {
  const obj = emitExpression(node.object as N.AstNode);
  const prop = node.property.text;
  return `${obj}.${prop}`;
}

function emitSubscript(node: N.SubscriptExpressionNode): string {
  const obj = emitExpression(node.object as N.AstNode);
  const index = node.index as N.AstNode;
  // neoc exposes 0-based indexing; Lua tables are 1-based. Shift
  // numeric subscripts by `+ 1` so `arr[0]` reads the first element.
  // String / template-string indices are dict-style lookups and pass
  // through unshifted — they're keys, not array offsets.
  if (index.kind === "string" || index.kind === "template_string") {
    return `${obj}[${emitExpression(index)}]`;
  }
  if (index.kind === "number") {
    const literal = Number(index.text);
    if (Number.isInteger(literal)) return `${obj}[${literal + 1}]`;
  }
  return `${obj}[(${emitExpression(index)}) + 1]`;
}

function emitObjectLiteral(node: N.ObjectLiteralNode): string {
  const props = (node.children ?? []).map((c) => emitObjectEntry(c as N.AstNode)).filter(Boolean);
  return `{ ${props.join(", ")} }`;
}

function emitObjectEntry(node: N.AstNode): string {
  switch (node.kind) {
    case "object_property": {
      const op = node as N.ObjectPropertyNode;
      const key = op.key.text;
      const value = emitExpression(op.value as N.AstNode);
      return `${key} = ${value}`;
    }
    case "shorthand_property": {
      const sp = node as N.ShorthandPropertyNode;
      const name = (sp as unknown as { children: N.IdentifierNode }).children.text;
      return `${name} = ${name}`;
    }
    case "spread_element":
      // Lua has no spread inside table constructors. Drop with a
      // comment so the output is at least valid Lua — the user can
      // see they reached for an unsupported feature.
      return `--[[ spread unsupported ]]`;
    default:
      return node.text;
  }
}

function emitArrayLiteral(node: N.ArrayLiteralNode): string {
  const items = (node.children ?? [])
    .map((c) => emitExpression(c as N.AstNode))
    .join(", ");
  return `{ ${items} }`;
}

function emitTernary(node: N.TernaryExpressionNode): string {
  const cond = emitExpression((node as unknown as { condition: N.AstNode }).condition);
  const cons = emitExpression((node as unknown as { consequence: N.AstNode }).consequence);
  const alt = emitExpression((node as unknown as { alternative: N.AstNode }).alternative);
  return `((${cond}) and (${cons}) or (${alt}))`;
}

function emitAssignment(node: N.AssignmentExpressionNode): string {
  const lhs = emitExpression(node.left as N.AstNode);
  const rhs = emitExpression(node.right as N.AstNode);
  // The grammar admits compound operators (`+=`, etc.); for now
  // just emit them verbatim — Lua doesn't support compound assign
  // and the user already hit a limitation.
  const opText = operatorBetween(node, node.left, node.right);
  return `${lhs} ${opText} ${rhs}`;
}

function emitTemplateString(node: N.TemplateStringNode): string {
  // Template strings lower to string-concat. Walk the children:
  // `template_chars` segments become string literals, and
  // `template_substitution` slots become `tostring(expr)`.
  const parts: string[] = [];
  for (const c of node.children ?? []) {
    if (c.kind === "template_chars") {
      parts.push(JSON.stringify(c.text));
    } else if (c.kind === "template_substitution") {
      const inner = firstChildExpr(c as N.AstNode);
      parts.push(`tostring(${emitExpression(inner)})`);
    } else if (c.kind === "escape_sequence") {
      parts.push(JSON.stringify(c.text));
    }
  }
  if (parts.length === 0) return `""`;
  return parts.join(" .. ");
}

function emitArrowFunction(node: N.ArrowFunctionNode): string {
  const paramsNode = (node as unknown as { parameters?: N.ArrowParametersNode | N.IdentifierNode }).parameters;
  let params = "";
  if (paramsNode) {
    if (paramsNode.kind === "identifier") {
      params = paramsNode.text;
    } else if ((paramsNode as N.ArrowParametersNode).children) {
      params = ((paramsNode as N.ArrowParametersNode).children ?? [])
        .map((p) => (p as { name?: N.IdentifierNode }).name?.text ?? "")
        .filter(Boolean)
        .join(", ");
    }
  }
  const body = node.body as N.AstNode;
  if (body.kind === "statement_block") {
    return `function(${params})\n${indent(emitInnerBlock(body as N.StatementBlockNode))}\nend`;
  }
  return `function(${params}) return ${emitExpression(body)} end`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isStringy(node: { kind?: string } | undefined): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.kind === "string" || node.kind === "template_string") return true;
  if (node.kind === "range_expression") {
    const r = node as unknown as N.RangeExpressionNode;
    return isStringy(r.start) || isStringy(r.end);
  }
  return false;
}

function firstChildExpr(node: N.AstNode): N.AstNode | undefined {
  const children = (node as unknown as { children?: N.AstNode[] | N.AstNode }).children;
  if (!children) return undefined;
  if (Array.isArray(children)) return children[0];
  return children;
}

function indent(text: string): string {
  if (text.length === 0) return text;
  return text.split("\n").map((l) => INDENT + l).join("\n");
}

/** Reset emitter state between bodies — `__r` counter needs to start
 * fresh per function so generated names don't drift across files. */
export function resetEmitterState(): void {
  tryCounter = 0;
}
