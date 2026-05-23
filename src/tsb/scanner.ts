/**
 * Low-level scanner for `.tsb` source. Walks the input once, classifying
 * each byte into one of a few categories:
 *
 *   - Skip regions: string literals (`'`/`"`/template), regex literals,
 *     line comments, block comments. The rewriter never looks inside
 *     these — they pass through verbatim.
 *   - Structural tokens: braces, brackets, parens, commas, semicolons,
 *     colons, `=>`. Used to find block boundaries.
 *   - Identifiers (incl. the four new keywords `struct` / `impl` / `match`
 *     / `Self` — recognised as tokens but treated as identifiers by the
 *     rewriter except where they participate in the new constructs).
 *   - The `#[` attribute opener.
 *   - Everything else (operators, numeric literals, …) is just opaque
 *     "code" bytes the rewriter forwards.
 *
 * The scanner is intentionally NOT a full TS parser. It does only enough
 * to find construct boundaries reliably. The rewriter handles the rest.
 */

export type TokenKind =
  | "ws"            // whitespace
  | "line-comment"  // // …
  | "block-comment" // /* … */
  | "string"        // "…" or '…'
  | "template"      // `…` (incl. ${…} substitutions)
  | "regex"         // /…/flags
  | "lbrace"        // {
  | "rbrace"        // }
  | "lparen"        // (
  | "rparen"        // )
  | "lbracket"      // [
  | "rbracket"      // ]
  | "attr-open"     // #[
  | "comma"         // ,
  | "semi"          // ;
  | "colon"         // :
  | "arrow"         // =>
  | "eq"            // = (single)
  | "ident"         // identifier (incl. struct/impl/match/Self kws)
  | "number"        // numeric literal
  | "other";        // anything else (operators, punctuation, …)

export interface Token {
  kind: TokenKind;
  /** Byte offset (inclusive) into the source. */
  start: number;
  /** Byte offset (exclusive) into the source. */
  end: number;
  /** Verbatim lexeme; cheap copy because most tokens are tiny. */
  text: string;
}

const KW_NEW = new Set(["struct", "impl", "match", "Self"]);

const ID_START_RE = /[A-Za-z_$]/;
const ID_CONT_RE = /[A-Za-z0-9_$]/;

/** Tokens whose lexeme is the punctuation itself. */
const PUNCT_MAP: Record<string, TokenKind> = {
  "{": "lbrace",
  "}": "rbrace",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  ";": "semi",
  ":": "colon",
};

/**
 * Tokenize `.tsb` source. The output is a complete token stream covering
 * every byte of the input (concatenating `tok.text` reconstructs the
 * source exactly). The rewriter walks this stream.
 */
export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = source.length;

  /** Was the most recent non-trivia token one that ends a value expression? */
  let lastSignificantWasValue = false;

  while (i < n) {
    const c = source[i]!;

    // Whitespace ------------------------------------------------------------
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      const start = i;
      while (i < n && /\s/.test(source[i]!)) i++;
      out.push({ kind: "ws", start, end: i, text: source.slice(start, i) });
      continue;
    }

    // Line comment ----------------------------------------------------------
    if (c === "/" && source[i + 1] === "/") {
      const start = i;
      i += 2;
      while (i < n && source[i] !== "\n") i++;
      out.push({ kind: "line-comment", start, end: i, text: source.slice(start, i) });
      continue;
    }

    // Block comment ---------------------------------------------------------
    if (c === "/" && source[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      if (i < n) i += 2; // consume the closing */
      out.push({ kind: "block-comment", start, end: i, text: source.slice(start, i) });
      continue;
    }

    // String literal (single/double) ----------------------------------------
    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      i++;
      while (i < n) {
        const ch = source[i]!;
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) {
          i++;
          break;
        }
        if (ch === "\n") {
          // Unterminated string — bail at the newline. TS will error at this position.
          break;
        }
        i++;
      }
      out.push({ kind: "string", start, end: i, text: source.slice(start, i) });
      lastSignificantWasValue = true;
      continue;
    }

    // Template literal ------------------------------------------------------
    // Template substitutions `${…}` can contain anything including nested
    // template literals, so we recurse via brace tracking.
    if (c === "`") {
      const start = i;
      i = consumeTemplate(source, i);
      out.push({ kind: "template", start, end: i, text: source.slice(start, i) });
      lastSignificantWasValue = true;
      continue;
    }

    // Attribute opener `#[` --------------------------------------------------
    if (c === "#" && source[i + 1] === "[") {
      const start = i;
      i += 2;
      out.push({ kind: "attr-open", start, end: i, text: source.slice(start, i) });
      lastSignificantWasValue = false;
      continue;
    }

    // `=>` arrow -------------------------------------------------------------
    if (c === "=" && source[i + 1] === ">") {
      const start = i;
      i += 2;
      out.push({ kind: "arrow", start, end: i, text: "=>" });
      lastSignificantWasValue = false;
      continue;
    }

    // `=` single --- followed by neither `=` nor `>` -------------------------
    if (c === "=" && source[i + 1] !== "=" && source[i + 1] !== ">") {
      out.push({ kind: "eq", start: i, end: i + 1, text: "=" });
      i++;
      lastSignificantWasValue = false;
      continue;
    }

    // Punctuation -----------------------------------------------------------
    if (PUNCT_MAP[c] !== undefined) {
      out.push({ kind: PUNCT_MAP[c]!, start: i, end: i + 1, text: c });
      i++;
      lastSignificantWasValue = c === ")" || c === "]" || c === "}";
      continue;
    }

    // Regex literal vs division --------------------------------------------
    // A `/` is a regex when the preceding non-trivia token can't be the end
    // of a value expression (i.e. is a punctuator like `(`, `,`, `=`, `=>`,
    // `;`, `:`, or the very start of input). Otherwise it's division.
    if (c === "/") {
      if (!lastSignificantWasValue) {
        const start = i;
        i = consumeRegex(source, i);
        out.push({ kind: "regex", start, end: i, text: source.slice(start, i) });
        lastSignificantWasValue = true;
        continue;
      }
      // Division operator
      out.push({ kind: "other", start: i, end: i + 1, text: "/" });
      i++;
      lastSignificantWasValue = false;
      continue;
    }

    // Identifier / keyword --------------------------------------------------
    if (ID_START_RE.test(c)) {
      const start = i;
      i++;
      while (i < n && ID_CONT_RE.test(source[i]!)) i++;
      const text = source.slice(start, i);
      out.push({ kind: "ident", start, end: i, text });
      lastSignificantWasValue = true;
      // Note: kw membership (struct/impl/match/Self) is the rewriter's job —
      // syntactically they're identifiers, semantically the rewriter
      // recognises them by `text`.
      continue;
    }

    // Numeric literal -------------------------------------------------------
    if (c >= "0" && c <= "9") {
      const start = i;
      while (i < n && /[0-9eE._xXbBoOnA-Fa-f]/.test(source[i]!)) i++;
      out.push({ kind: "number", start, end: i, text: source.slice(start, i) });
      lastSignificantWasValue = true;
      continue;
    }

    // Anything else — operators, punctuation we don't track specially.
    out.push({ kind: "other", start: i, end: i + 1, text: c });
    i++;
    lastSignificantWasValue = true;
  }

  return out;
}

function consumeTemplate(source: string, start: number): number {
  // We start at the opening backtick. Consume bytes until we reach a closing
  // backtick at depth 0. Inside `${…}` substitutions we recurse via brace
  // tracking + nested template detection.
  let i = start + 1;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return i + 1;
    if (ch === "$" && source[i + 1] === "{") {
      i = consumeTemplateSub(source, i + 2);
      continue;
    }
    i++;
  }
  return i;
}

function consumeTemplateSub(source: string, start: number): number {
  // `start` is the first byte AFTER `${`. Read until matching `}` at depth 0,
  // tracking nested braces, strings, templates.
  let i = start;
  const n = source.length;
  let depth = 1;
  while (i < n && depth > 0) {
    const ch = source[i]!;
    if (ch === "{") { depth++; i++; continue; }
    if (ch === "}") { depth--; i++; continue; }
    if (ch === '"' || ch === "'") { i = consumeString(source, i); continue; }
    if (ch === "`") { i = consumeTemplate(source, i); continue; }
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      if (i < n) i += 2;
      continue;
    }
    i++;
  }
  return i;
}

function consumeString(source: string, start: number): number {
  const quote = source[start]!;
  let i = start + 1;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\\") { i += 2; continue; }
    if (ch === quote) return i + 1;
    if (ch === "\n") return i;
    i++;
  }
  return i;
}

function consumeRegex(source: string, start: number): number {
  // start is the opening `/`. Skip through bytes, respecting character
  // classes `[...]` (which can contain `/`).
  let i = start + 1;
  const n = source.length;
  let inClass = false;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\\") { i += 2; continue; }
    if (ch === "\n") return i;
    if (ch === "[") { inClass = true; i++; continue; }
    if (ch === "]") { inClass = false; i++; continue; }
    if (ch === "/" && !inClass) {
      i++;
      // Flags: skip identifier chars.
      while (i < n && /[a-z]/i.test(source[i]!)) i++;
      return i;
    }
    i++;
  }
  return i;
}

/**
 * Convenience: filter out trivia (whitespace + comments) for the rewriter.
 * The rewriter still needs the trivia for source-faithful output, so we
 * keep the original list too. This returns indices into the original list.
 */
export function nonTriviaIndices(tokens: readonly Token[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const k = tokens[i]!.kind;
    if (k === "ws" || k === "line-comment" || k === "block-comment") continue;
    out.push(i);
  }
  return out;
}

/**
 * `true` iff this token's lexeme is one of the new `.tsb` keywords. The
 * scanner tags every identifier as `ident`; the rewriter uses this helper
 * to filter.
 */
export function isNewKeyword(token: Token): boolean {
  return token.kind === "ident" && KW_NEW.has(token.text);
}
