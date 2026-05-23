/**
 * Lower Rust-style block expressions to Lua immediately-invoked
 * function expressions (IIFEs).
 *
 *   { stmt; stmt; final-expression }
 *     →
 *   (function() <stmt-text> return <final-expression> end)()
 *
 * The block introduces a fresh scope, which the Lua IIFE provides
 * naturally. The final non-statement expression becomes the IIFE's
 * `return`.
 *
 * The rewrite operates on the verbatim body text (same pattern as
 * `lower-try.ts` and `lower-range.ts`). We collect only the outermost
 * `block_expression` nodes within the body and replace each with a
 * recursively-rendered IIFE — nested blocks are handled by the
 * recursive `renderBlock` walk, not by a separate splice pass, which
 * keeps source-offset arithmetic simple.
 */
import type * as N from "../ast/nodes.generated.ts";

export function lowerBlock(node: N.NodeBase, bodyText: string): string {
  const baseOffset = node.startIndex;
  const blocks: N.BlockExpressionNode[] = [];
  collectOuterBlocks(node as N.AstNode, blocks);
  if (blocks.length === 0) return bodyText;
  // Splice from the back so earlier-position edits don't shift later
  // ones. Outer blocks are siblings (not nested), so a strict order
  // by startIndex is well-defined.
  blocks.sort((a, b) => b.startIndex - a.startIndex);

  let out = bodyText;
  for (const b of blocks) {
    const start = b.startIndex - baseOffset;
    const end = b.endIndex - baseOffset;
    if (start < 0 || end > out.length) continue;
    out = out.slice(0, start) + renderBlock(b) + out.slice(end);
  }
  return out;
}

// Collect top-level block_expression nodes — descend into children
// but stop recursing the moment a block is found, so an inner block
// nested inside its outer block isn't surfaced here. The outer
// block's renderer handles nested blocks itself.
function collectOuterBlocks(
  node: N.AstNode | undefined,
  out: N.BlockExpressionNode[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) collectOuterBlocks(c, out);
    return;
  }
  if (node.kind === "block_expression") {
    out.push(node as N.BlockExpressionNode);
    return;
  }
  for (const key of Object.keys(node)) {
    if (["kind", "startIndex", "endIndex", "startPosition", "endPosition", "text"].includes(key)) continue;
    collectOuterBlocks((node as unknown as Record<string, unknown>)[key] as N.AstNode, out);
  }
}

// Render one block as `(function() <stmts> return <final> end)()`.
// Statement and final-expression text come straight from the AST
// fields; nested blocks inside either part are lowered by recursing
// through `lowerBlock` anchored at the relevant sub-node.
function renderBlock(node: N.BlockExpressionNode): string {
  const finalStartLocal = node.final.startIndex - node.startIndex;
  const finalEndLocal = node.final.endIndex - node.startIndex;
  // The block's verbatim text is `{ … }`. Statements live between
  // the opening `{` and the final expression; whitespace and the
  // closing `}` follow the final expression. Slice out both parts
  // from the unmodified text.
  const statementsRaw = node.text.slice(1, finalStartLocal);
  const finalRaw = node.text.slice(finalStartLocal, finalEndLocal);

  // Recurse: lower nested block_expressions inside each part. For
  // the statements section we use a synthetic NodeBase that points
  // at the statements' source span; collectOuterBlocks walks the
  // outer block's children but skips its `final` (handled below).
  const statementsLowered = lowerNestedBlocksInStatements(node, statementsRaw);
  const finalLowered = lowerBlock(node.final, finalRaw);

  const stmtPart = statementsLowered.trim();
  const finalPart = finalLowered.trim();
  const lead = stmtPart.length > 0 ? `${stmtPart} ` : "";
  return `(function() ${lead}return ${finalPart} end)()`;
}

// Walk every child of `block` except `final`, collect any
// block_expression nodes inside them, and splice their IIFE renderings
// into `statementsRaw`. Anchored at `block.startIndex + 1` so source
// offsets line up with the slice the caller passed in.
function lowerNestedBlocksInStatements(
  block: N.BlockExpressionNode,
  statementsRaw: string,
): string {
  const baseOffset = block.startIndex + 1;
  const blocks: N.BlockExpressionNode[] = [];
  for (const child of block.children ?? []) {
    if ((child as N.AstNode) === (block.final as N.AstNode)) continue;
    collectOuterBlocks(child as N.AstNode, blocks);
  }
  if (blocks.length === 0) return statementsRaw;
  blocks.sort((a, b) => b.startIndex - a.startIndex);
  let out = statementsRaw;
  for (const b of blocks) {
    const start = b.startIndex - baseOffset;
    const end = b.endIndex - baseOffset;
    if (start < 0 || end > out.length) continue;
    out = out.slice(0, start) + renderBlock(b) + out.slice(end);
  }
  return out;
}
