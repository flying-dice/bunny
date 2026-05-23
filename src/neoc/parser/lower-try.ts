/**
 * Lower the postfix `?` operator on `Result<T, E>` to Lua statements
 * that early-return on `Err`.
 *
 * Two statement-level shapes are recognised:
 *
 *   1. `let v = expr?;`  →  local __r = expr
 *                           if not __r.ok then return __r end
 *                           local v = __r.value
 *
 *   2. `expr?;`          →  local __r = expr
 *                           if not __r.ok then return __r end
 *
 * The rewrite happens on the verbatim body text (same pattern as
 * `lower-match.ts`). Splices run bottom-up so earlier-position edits
 * don't shift later ones. A try expression that lands outside these
 * two statement shapes is left untouched — Lua has no IIFE form that
 * can short-circuit the outer function, and the user is expected to
 * promote the expression to a `let` first.
 */
import type * as N from "../ast/nodes.generated.ts";

interface Splice {
  /** Byte offset, relative to bodyText, where the rewrite starts. */
  start: number;
  /** Byte offset, relative to bodyText, where the rewrite ends. */
  end: number;
  /** Replacement Lua text. */
  text: string;
}

export function lowerTry(node: N.NodeBase, bodyText: string): string {
  const baseOffset = node.startIndex;
  const splices: Splice[] = [];
  let counter = 0;
  const nextName = (): string => `__r${counter === 0 ? "" : `_${counter}`}` ;

  collectSplices(node as N.AstNode, baseOffset, bodyText, splices, () => {
    const name = nextName();
    counter++;
    return name;
  });

  if (splices.length === 0) return bodyText;

  splices.sort((a, b) => b.start - a.start);
  let out = bodyText;
  for (const s of splices) {
    if (s.start < 0 || s.end > out.length) continue;
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
  }
  return out;
}

function collectSplices(
  node: N.AstNode | undefined,
  baseOffset: number,
  bodyText: string,
  out: Splice[],
  freshName: () => string,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) collectSplices(c, baseOffset, bodyText, out, freshName);
    return;
  }

  // `let v = expr?;` — the variable_declaration's value is a try_expression.
  if (node.kind === "variable_declaration") {
    const vd = node as N.VariableDeclarationNode;
    if (vd.value && vd.value.kind === "try_expression") {
      const inner = innerExpressionText(vd.value as N.TryExpressionNode);
      const name = freshName();
      const varName = vd.name.text;
      const replacement =
        `local ${name} = ${inner}\n` +
        `if not ${name}.ok then return ${name} end\n` +
        `local ${varName} = ${name}.value;`;
      out.push({
        start: vd.startIndex - baseOffset,
        end: vd.endIndex - baseOffset,
        text: replacement,
      });
      return;
    }
  }

  // Bare `expr?;` at statement position — the grammar lifts this to a
  // top-level `try_expression` inside a statement_block. Tree-sitter
  // strips the trailing `;` because the choice `seq($._expression, ';')`
  // doesn't keep it as part of the expression's span, so we look one
  // past `endIndex` in the source to swallow it when present.
  if (node.kind === "try_expression") {
    const tryNode = node as N.TryExpressionNode;
    const inner = innerExpressionText(tryNode);
    const name = freshName();
    let end = tryNode.endIndex - baseOffset;
    if (bodyText[end] === ";") end += 1;
    const replacement =
      `local ${name} = ${inner}\n` +
      `if not ${name}.ok then return ${name} end`;
    out.push({
      start: tryNode.startIndex - baseOffset,
      end,
      text: replacement,
    });
    return;
  }

  for (const key of Object.keys(node)) {
    if (["kind", "startIndex", "endIndex", "startPosition", "endPosition", "text"].includes(key)) continue;
    collectSplices(
      (node as unknown as Record<string, unknown>)[key] as N.AstNode,
      baseOffset,
      bodyText,
      out,
      freshName,
    );
  }
}

function innerExpressionText(node: N.TryExpressionNode): string {
  // The grammar holds the inner expression as the node's single
  // unnamed child. The verbatim text is `<expr>?` — trim the trailing
  // `?` and any whitespace that crept in front of it.
  const raw = node.text.replace(/\?\s*$/, "");
  return raw.trim();
}
