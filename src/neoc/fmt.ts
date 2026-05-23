/**
 * `.neoc` source formatter. Pure text pass — no AST rebuild.
 *
 * Rules:
 *   1. Normalise indentation to 2 spaces (tabs → 2 spaces).
 *   2. Strip trailing whitespace from every line.
 *   3. Collapse runs of blank lines to a single blank line between
 *      top-level declarations.
 *   4. End the file with exactly one trailing newline.
 *   5. Normalise `#[derive(A,B,C)]` → `#[derive(A, B, C)]` (one space
 *      after each comma).
 *
 * Opaque body text (the Lua the user writes inside method bodies and
 * top-level gaps) is left structurally alone — only trailing whitespace
 * and tab-indentation are touched. We don't reflow code we don't own.
 */

/**
 * Format a `.neoc` source string. Returns the canonical text. Pure
 * function, safe to call repeatedly — `formatSource(formatSource(x))`
 * equals `formatSource(x)`.
 *
 * @param text - The raw `.neoc` source.
 * @returns The formatted source string.
 */
export function formatSource(text: string): string {
  let out = text;
  out = normaliseIndent(out);
  out = stripTrailingWhitespace(out);
  out = collapseBlankLines(out);
  out = normaliseDeriveSpacing(out);
  out = ensureSingleTrailingNewline(out);
  return out;
}

// Replace leading tabs with two spaces per tab. Only touches indentation
// — embedded tabs inside the line stay put (rare in neoc, but we won't
// corrupt them).
function normaliseIndent(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let i = 0;
      while (i < line.length && line[i] === "\t") i++;
      if (i === 0) return line;
      return "  ".repeat(i) + line.slice(i);
    })
    .join("\n");
}

function stripTrailingWhitespace(text: string): string {
  return text.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n");
}

// Two or more consecutive blank lines collapse to one.
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

// `#[derive(A,B,C)]` → `#[derive(A, B, C)]`. We only rewrite the comma
// spacing inside a `derive(...)` invocation; other attribute payloads
// stay untouched. The regex is anchored to `derive(` so it doesn't
// touch user-defined function-attr macros.
function normaliseDeriveSpacing(text: string): string {
  return text.replace(/#\[derive\(([^)]*)\)\]/g, (_, inner: string) => {
    const parts = inner.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
    return `#[derive(${parts.join(", ")})]`;
  });
}

function ensureSingleTrailingNewline(text: string): string {
  return `${text.replace(/\n+$/, "")}\n`;
}
