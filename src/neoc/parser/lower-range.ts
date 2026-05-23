/**
 * Lower `start..end` and `start..=end` range expressions to Lua
 * sequence-building IIFEs at expression position.
 *
 *   0..3   →  (function() local r = {} for i = 0, 3 - 1 do r[#r + 1] = i end return r end)()
 *   0..=3  →  (function() local r = {} for i = 0, 3     do r[#r + 1] = i end return r end)()
 *
 * The rewrite happens on the verbatim body text (same pattern as
 * `lower-try.ts` and `lower-match.ts`). Splices run bottom-up so
 * earlier-position edits don't shift later ones.
 *
 * The `for x in <range>` numeric-loop form is a follow-up — it
 * requires a `for_statement` grammar production this pass doesn't
 * touch.
 */
import type * as N from "../ast/nodes.generated.ts";

export function lowerRange(node: N.NodeBase, bodyText: string): string {
  const baseOffset = node.startIndex;
  const ranges: N.RangeExpressionNode[] = [];
  collectRanges(node as N.AstNode, ranges);
  if (ranges.length === 0) return bodyText;
  ranges.sort((a, b) => b.startIndex - a.startIndex);

  let out = bodyText;
  for (const r of ranges) {
    const start = r.startIndex - baseOffset;
    const end = r.endIndex - baseOffset;
    if (start < 0 || end > out.length) continue;
    // Tree-sitter happily parses Lua-style string concat (`"a" .. b`)
    // as a range now that the grammar owns `..`. Bodies are opaque
    // Lua, so leave string-flanked ranges untouched — the verbatim
    // `..` already means concat in Lua.
    if (looksLikeConcat(r)) continue;
    out = out.slice(0, start) + renderRangeAsIife(r) + out.slice(end);
  }
  return out;
}

function looksLikeConcat(r: N.RangeExpressionNode): boolean {
  return isStringy(r.start) || isStringy(r.end);
}

function isStringy(node: N.NodeBase & { kind?: string }): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.kind === "string" || node.kind === "template_string") return true;
  // A nested range whose own operand is a string — `a .. "," .. b`
  // parses as `(a .. ",") .. b` (left-associative), so recurse into
  // the children.
  if (node.kind === "range_expression") {
    const r = node as unknown as N.RangeExpressionNode;
    return isStringy(r.start) || isStringy(r.end);
  }
  return false;
}

function collectRanges(
  node: N.AstNode | undefined,
  out: N.RangeExpressionNode[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) collectRanges(c, out);
    return;
  }
  if (node.kind === "range_expression") {
    out.push(node);
  }
  for (const key of Object.keys(node)) {
    if (["kind", "startIndex", "endIndex", "startPosition", "endPosition", "text"].includes(key)) continue;
    collectRanges((node as unknown as Record<string, unknown>)[key] as N.AstNode, out);
  }
}

function renderRangeAsIife(node: N.RangeExpressionNode): string {
  const startText = node.start.text.trim();
  const endText = node.end.text.trim();
  // The `op` field tags `..` vs `..=` in the grammar, but tree-sitter
  // strips anonymous tokens from the named-child walk, so the field
  // never lands on the AST node at runtime. Inspect the slice of raw
  // source that sits between the two operand spans instead.
  const between = node.text
    .slice(node.start.endIndex - node.startIndex, node.end.startIndex - node.startIndex)
    .trim();
  const inclusive = between === "..=";
  const upper = inclusive ? endText : `${endText} - 1`;
  return (
    `(function() local r = {} ` +
    `for i = ${startText}, ${upper} do r[#r + 1] = i end ` +
    `return r end)()`
  );
}
