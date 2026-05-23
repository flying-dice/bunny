/**
 * Lower `match expr { pattern => result, … }` expressions inside method
 * and function bodies. The lowered form is an IIFE that binds the
 * scrutinee to `__m` and runs each arm's check in order:
 *
 *   match value {
 *     1                => "one",
 *     "two"            => "two",
 *     { kind: "X" }    => `discriminant`,
 *     x                => `binding: ${x}`,
 *     _                => "nope",
 *   }
 *
 * lowers to
 *
 *   ((__m) => {
 *     if (__m === 1) return "one";
 *     if (__m === "two") return "two";
 *     if (typeof __m === "object" && __m !== null && (__m as any).kind === "X") return `discriminant`;
 *     { const x = __m; return `binding: ${x}`; }
 *     return "nope";
 *   })(value)
 *
 * The minimum viable surface for the first pass:
 *   - literal patterns (number / string / boolean / null / undefined)
 *   - wildcard `_`
 *   - discriminant `{ kind: "X" }` (no destructuring binding yet)
 *   - identifier binding (`x => …` binds `__m` as `x` for that arm)
 *
 * Object-destructure bindings, guards (`pattern if cond`), array
 * patterns, and nested patterns land in later passes.
 */

import { tokenize, type Token } from "./scanner.ts";

/**
 * Walk a body string, find every `match` expression, lower it. Bodies
 * that don't contain `match` are returned unchanged.
 */
export function lowerMatchExpressions(body: string): string {
  if (!body.includes("match")) return body;
  const tokens = tokenize(body);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === "ident" && t.text === "match" && isMatchInExpressionPosition(tokens, i)) {
      const lowered = tryLowerMatch(tokens, i);
      if (lowered) {
        out.push(lowered.text);
        i = lowered.next;
        continue;
      }
    }
    out.push(t.text);
    i++;
  }
  return out.join("");
}

/**
 * `match` is an expression keyword. Heuristic: the previous non-trivia
 * token must be one that can be followed by an expression — punctuator,
 * `return`, `=>`, comma, etc. (If preceded by an identifier we'd be
 * inside something like `obj.match`, which is a method access.)
 */
function isMatchInExpressionPosition(tokens: readonly Token[], at: number): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const k = tokens[i]!.kind;
    if (k === "ws" || k === "line-comment" || k === "block-comment") continue;
    // Allowed predecessors for an expression position.
    if (k === "lbrace" || k === "lparen" || k === "lbracket" || k === "comma" ||
        k === "semi" || k === "colon" || k === "arrow" || k === "eq") {
      return true;
    }
    if (k === "ident") {
      // Treat statement-introducing keywords as OK predecessors.
      const text = tokens[i]!.text;
      if (text === "return" || text === "yield" || text === "throw" ||
          text === "await" || text === "void" || text === "typeof") {
        return true;
      }
    }
    return false;
  }
  return true; // very start of input
}

interface LoweredMatch {
  text: string;
  next: number;
}

function tryLowerMatch(tokens: readonly Token[], matchIdx: number): LoweredMatch | undefined {
  // tokens[matchIdx] is `match`. The scrutinee runs from the next non-trivia
  // token up to the `{` that opens the arms block. We don't allow the
  // scrutinee itself to contain `{` (a literal object scrutinee would
  // collide with the arms block opener) — for the first pass, the user
  // can hoist such expressions into a `let` above the match.
  let i = matchIdx + 1;
  while (i < tokens.length && isTrivia(tokens[i]!)) i++;
  if (i >= tokens.length) return undefined;

  const scrutineeStart = i;
  let depth = 0;
  let armsBraceIdx = -1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === "lparen" || t.kind === "lbracket") depth++;
    else if (t.kind === "rparen" || t.kind === "rbracket") depth--;
    else if (t.kind === "lbrace") {
      if (depth === 0) { armsBraceIdx = i; break; }
      depth++;
    } else if (t.kind === "rbrace") depth--;
    i++;
  }
  if (armsBraceIdx === -1) return undefined;
  const scrutineeText = joinTexts(tokens, scrutineeStart, armsBraceIdx).trim();
  if (scrutineeText.length === 0) return undefined;

  const armsCloseIdx = findMatching(tokens, armsBraceIdx, "lbrace", "rbrace");
  if (armsCloseIdx === -1) return undefined;

  const arms = parseArms(tokens, armsBraceIdx + 1, armsCloseIdx);
  if (arms === undefined) return undefined;

  const lowered = renderLowered(scrutineeText, arms);
  return { text: lowered, next: armsCloseIdx + 1 };
}

interface Arm {
  pattern: Pattern;
  resultText: string;
}

type Pattern =
  | { kind: "literal"; text: string }
  | { kind: "wildcard" }
  | { kind: "identifier"; name: string }
  /**
   * Object pattern. Each entry is either a *check* (the field must
   * equal a primitive literal) or a *binding* (the field's value gets
   * bound to a new identifier for the arm body). Both forms compose:
   *
   *   { kind: "Hello", who: name } → check kind, bind who as `name`
   *   { ok: true, value: v }       → check ok, bind value as `v`
   */
  | { kind: "object"; entries: ObjectPatternEntry[] };

type ObjectPatternEntry =
  | { type: "check"; key: string; valueText: string }
  | { type: "bind"; key: string; binding: string };

function parseArms(tokens: readonly Token[], from: number, to: number): Arm[] | undefined {
  const arms: Arm[] = [];
  let i = from;
  while (i < to) {
    // Skip leading trivia / comma.
    while (i < to && (isTrivia(tokens[i]!) || tokens[i]!.kind === "comma")) i++;
    if (i >= to) break;

    // Find the `=>` that ends the pattern at this depth.
    const arrowIdx = findArrowAtDepth(tokens, i, to);
    if (arrowIdx === -1) return undefined;
    const patternText = joinTexts(tokens, i, arrowIdx).trim();
    const pattern = parsePattern(patternText, tokens, i, arrowIdx);
    if (!pattern) return undefined;

    // Result runs from after `=>` to next `,` at depth 0 (or `to`).
    let j = arrowIdx + 1;
    const resultStart = j;
    let depth = 0;
    let resultEnd = to;
    while (j < to) {
      const t = tokens[j]!;
      if (t.kind === "lbrace" || t.kind === "lparen" || t.kind === "lbracket") depth++;
      else if (t.kind === "rbrace" || t.kind === "rparen" || t.kind === "rbracket") depth--;
      else if (t.kind === "comma" && depth === 0) { resultEnd = j; break; }
      j++;
    }
    const resultText = joinTexts(tokens, resultStart, resultEnd).trim();
    arms.push({ pattern, resultText });
    i = resultEnd + 1;
  }
  return arms;
}

function findArrowAtDepth(tokens: readonly Token[], from: number, to: number): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const t = tokens[i]!;
    if (t.kind === "lbrace" || t.kind === "lparen" || t.kind === "lbracket") depth++;
    else if (t.kind === "rbrace" || t.kind === "rparen" || t.kind === "rbracket") depth--;
    else if (t.kind === "arrow" && depth === 0) return i;
  }
  return -1;
}

function parsePattern(
  text: string,
  tokens: readonly Token[],
  from: number,
  to: number
): Pattern | undefined {
  const trimmed = text.trim();
  if (trimmed === "_") return { kind: "wildcard" };
  if (trimmed === "undefined" || trimmed === "null" || trimmed === "true" || trimmed === "false") {
    return { kind: "literal", text: trimmed };
  }
  if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith("`")) {
    return { kind: "literal", text: trimmed };
  }
  if (/^-?\d/.test(trimmed)) {
    return { kind: "literal", text: trimmed };
  }
  if (trimmed.startsWith("{")) {
    // Parse one or more `<key>: <literal-or-ident>` entries. A literal
    // value is a runtime check; an identifier is a binding that pulls
    // the field value into the arm's scope.
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) return { kind: "object", entries: [] };
    const entries: ObjectPatternEntry[] = [];
    for (const part of splitTopLevelCommas(inner)) {
      const literalMatch = part.match(
        /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*$/
      );
      if (literalMatch) {
        entries.push({ type: "check", key: literalMatch[1]!, valueText: literalMatch[2]! });
        continue;
      }
      const bindMatch = part.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);
      if (bindMatch) {
        entries.push({ type: "bind", key: bindMatch[1]!, binding: bindMatch[2]! });
        continue;
      }
      return undefined;
    }
    return { kind: "object", entries };
  }
  // Bare identifier — used as a binding for the whole scrutinee.
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) {
    return { kind: "identifier", name: trimmed };
  }
  return undefined;
}

function renderLowered(scrutinee: string, arms: readonly Arm[]): string {
  const lines: string[] = ["((__m) => {"];
  for (const arm of arms) {
    switch (arm.pattern.kind) {
      case "literal":
        lines.push(`  if (__m === ${arm.pattern.text}) return ${arm.resultText};`);
        break;
      case "wildcard":
        lines.push(`  return ${arm.resultText};`);
        break;
      case "identifier": {
        lines.push(`  { const ${arm.pattern.name} = __m; return ${arm.resultText}; }`);
        break;
      }
      case "object": {
        const checks = arm.pattern.entries.filter((e) => e.type === "check");
        const binds = arm.pattern.entries.filter((e) => e.type === "bind");
        const guards = checks.map(
          (c) => `(__m as Record<string, unknown>).${c.key} === ${c.valueText}`
        );
        const cond =
          guards.length === 0
            ? `typeof __m === "object" && __m !== null`
            : `typeof __m === "object" && __m !== null && ${guards.join(" && ")}`;
        if (binds.length === 0) {
          lines.push(`  if (${cond}) return ${arm.resultText};`);
        } else {
          // Pull each bound key off the scrutinee. We use `as any` here
          // because match doesn't know the static type of `__m` — the
          // caller's typed scrutinee is what makes the arm safe.
          const bindings = binds
            .map((b) => `const ${b.binding} = (__m as any).${b.key};`)
            .join(" ");
          lines.push(`  if (${cond}) { ${bindings} return ${arm.resultText}; }`);
        }
        break;
      }
    }
  }
  lines.push(`  throw new Error("match: no arm matched");`);
  lines.push(`})(${scrutinee})`);
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isTrivia(t: Token): boolean {
  return t.kind === "ws" || t.kind === "line-comment" || t.kind === "block-comment";
}

function joinTexts(tokens: readonly Token[], from: number, to: number): string {
  let out = "";
  for (let i = from; i < to; i++) out += tokens[i]!.text;
  return out;
}

/** Split a string on top-level commas (depth-aware over (), [], {}). */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(last, i));
      last = i + 1;
    }
  }
  if (last <= s.length) out.push(s.slice(last));
  return out;
}

function findMatching(
  tokens: readonly Token[],
  openIdx: number,
  openKind: Token["kind"],
  closeKind: Token["kind"]
): number {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    const k = tokens[i]!.kind;
    if (k === openKind) depth++;
    else if (k === closeKind) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
