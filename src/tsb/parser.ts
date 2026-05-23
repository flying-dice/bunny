/**
 * tsb parser — walks the token stream from the scanner and builds a
 * `Module` model. The parser only understands the constructs bunny needs
 * to lower (struct, impl, function, attribute); everything else stays as
 * `OpaqueText` and is forwarded byte-perfect.
 */

import * as M from "./model.ts";
import { tokenize, type Token } from "./scanner.ts";

export function parse(source: string): M.ParseResult {
  const tokens = tokenize(source);
  const diagnostics: M.ParseDiagnostic[] = [];
  const parts: M.ModulePart[] = [];

  /** Buffer of bytes that don't belong to any recognised declaration. */
  let opaqueStart = 0;
  /** Attributes consumed since the last declaration was emitted. */
  let pendingAttrs: M.Attr[] = [];
  /** Position immediately after the last consumed attribute (or 0). Used so
   *  flushing the opaque buffer skips the attribute and its trailing newline. */
  let opaqueWriteFrom = 0;

  const flushOpaque = (upTo: number): void => {
    if (upTo <= opaqueWriteFrom) return;
    const text = source.slice(opaqueWriteFrom, upTo);
    if (text.length === 0) return;
    parts.push({
      kind: "opaque",
      text,
      span: { start: opaqueWriteFrom, end: upTo },
    });
    opaqueWriteFrom = upTo;
  };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;

    // Attributes: consume the entire #[…] block (which may carry multiple
    // comma-separated attributes) plus any trivia up to the next
    // significant token. Each attribute attaches to whatever declaration
    // comes next.
    if (tok.kind === "attr-open") {
      flushOpaque(tok.start);
      const { attrs, next } = parseAttributeBlock(tokens, i, source, diagnostics);
      for (const a of attrs) pendingAttrs.push(a);
      // Skip any trivia immediately after the attribute so the opaque
      // buffer doesn't pick up the blank line between an attribute and
      // its declaration.
      let after = next;
      while (after < tokens.length && isTrivia(tokens[after]!)) after++;
      i = after;
      opaqueWriteFrom = tokens[i]?.start ?? source.length;
      opaqueStart = opaqueWriteFrom;
      continue;
    }

    // `export struct` / `export impl` / `export function` / `export async function`
    if (tok.kind === "ident" && tok.text === "export") {
      const nextIdx = nextNonTrivia(tokens, i + 1);
      if (nextIdx !== -1 && tokens[nextIdx]!.kind === "ident") {
        const nextText = tokens[nextIdx]!.text;
        if (
          nextText === "struct" ||
          nextText === "impl" ||
          nextText === "trait" ||
          nextText === "function"
        ) {
          flushOpaque(tok.start);
          const declStart = tok.start;
          const parsed =
            nextText === "struct"
              ? parseStruct(tokens, nextIdx, source, true, pendingAttrs, declStart, diagnostics)
              : nextText === "impl"
                ? parseImpl(tokens, nextIdx, source, true, pendingAttrs, declStart, diagnostics)
                : nextText === "trait"
                  ? parseTrait(tokens, nextIdx, source, true, pendingAttrs, declStart, diagnostics)
                  : parseFunction(tokens, nextIdx, source, true, pendingAttrs, declStart, false, diagnostics);
          parts.push(parsed.decl);
          pendingAttrs = [];
          i = parsed.next;
          opaqueWriteFrom = tokens[i]?.start ?? source.length;
          opaqueStart = opaqueWriteFrom;
          continue;
        }
        if (nextText === "async") {
          // export async function …
          const afterAsync = nextNonTrivia(tokens, nextIdx + 1);
          if (
            afterAsync !== -1 &&
            tokens[afterAsync]!.kind === "ident" &&
            tokens[afterAsync]!.text === "function"
          ) {
            flushOpaque(tok.start);
            const parsed = parseFunction(
              tokens,
              afterAsync,
              source,
              true,
              pendingAttrs,
              tok.start,
              true,
              diagnostics
            );
            parts.push(parsed.decl);
            pendingAttrs = [];
            i = parsed.next;
            opaqueWriteFrom = tokens[i]?.start ?? source.length;
            opaqueStart = opaqueWriteFrom;
            continue;
          }
        }
      }
    }

    // Bare `struct` / `impl` / `function` / `async function` (no `export`).
    if (tok.kind === "ident" && tok.text === "struct") {
      flushOpaque(tok.start);
      const parsed = parseStruct(tokens, i, source, false, pendingAttrs, tok.start, diagnostics);
      parts.push(parsed.decl);
      pendingAttrs = [];
      i = parsed.next;
      opaqueWriteFrom = tokens[i]?.start ?? source.length;
      opaqueStart = opaqueWriteFrom;
      continue;
    }
    if (tok.kind === "ident" && tok.text === "impl") {
      flushOpaque(tok.start);
      const parsed = parseImpl(tokens, i, source, false, pendingAttrs, tok.start, diagnostics);
      parts.push(parsed.decl);
      pendingAttrs = [];
      i = parsed.next;
      opaqueWriteFrom = tokens[i]?.start ?? source.length;
      opaqueStart = opaqueWriteFrom;
      continue;
    }
    if (tok.kind === "ident" && tok.text === "trait") {
      flushOpaque(tok.start);
      const parsed = parseTrait(tokens, i, source, false, pendingAttrs, tok.start, diagnostics);
      parts.push(parsed.decl);
      pendingAttrs = [];
      i = parsed.next;
      opaqueWriteFrom = tokens[i]?.start ?? source.length;
      opaqueStart = opaqueWriteFrom;
      continue;
    }
    if (
      tok.kind === "ident" &&
      tok.text === "function" &&
      pendingAttrs.length > 0
    ) {
      // We only treat free `function` declarations as parseable when
      // they're attributed — otherwise they're opaque TS that doesn't
      // need bunny to touch them. (Attribute-less functions live in
      // OpaqueText and pass through verbatim.)
      flushOpaque(tok.start);
      const parsed = parseFunction(tokens, i, source, false, pendingAttrs, tok.start, false, diagnostics);
      parts.push(parsed.decl);
      pendingAttrs = [];
      i = parsed.next;
      opaqueWriteFrom = tokens[i]?.start ?? source.length;
      opaqueStart = opaqueWriteFrom;
      continue;
    }
    if (
      tok.kind === "ident" &&
      tok.text === "async" &&
      pendingAttrs.length > 0
    ) {
      const after = nextNonTrivia(tokens, i + 1);
      if (
        after !== -1 &&
        tokens[after]!.kind === "ident" &&
        tokens[after]!.text === "function"
      ) {
        flushOpaque(tok.start);
        const parsed = parseFunction(tokens, after, source, false, pendingAttrs, tok.start, true, diagnostics);
        parts.push(parsed.decl);
        pendingAttrs = [];
        i = parsed.next;
        opaqueWriteFrom = tokens[i]?.start ?? source.length;
        opaqueStart = opaqueWriteFrom;
        continue;
      }
    }

    i++;
  }

  // Tail opaque text.
  flushOpaque(source.length);

  return {
    module: { parts, source },
    diagnostics,
  };
}

// ----------------------------------------------------------------------------
// Attributes
// ----------------------------------------------------------------------------

function parseAttributeBlock(
  tokens: readonly Token[],
  start: number,
  source: string,
  diagnostics: M.ParseDiagnostic[]
): { attrs: M.Attr[]; next: number } {
  const openTok = tokens[start]!;
  const closeIdx = findClosingBracket(tokens, start + 1);
  if (closeIdx === -1) {
    diagnostics.push({
      message: "unterminated attribute",
      span: { start: openTok.start, end: openTok.end },
    });
    return { attrs: [], next: start + 1 };
  }

  const attrs: M.Attr[] = [];
  let cursor = nextNonTrivia(tokens, start + 1);
  while (cursor !== -1 && cursor < closeIdx) {
    if (tokens[cursor]!.kind !== "ident") break;
    const name = tokens[cursor]!.text;
    const nameStart = tokens[cursor]!.start;
    cursor = nextNonTrivia(tokens, cursor + 1);
    let args = "";
    let argList: string[] = [];
    let endPos = nameStart;
    if (cursor !== -1 && cursor < closeIdx && tokens[cursor]!.kind === "lparen") {
      const parenClose = findMatching(tokens, cursor, "lparen", "rparen");
      if (parenClose === -1 || parenClose > closeIdx) {
        diagnostics.push({
          message: `unterminated args for attribute ${name}`,
          span: { start: tokens[cursor]!.start, end: tokens[cursor]!.end },
        });
        break;
      }
      args = joinTexts(tokens, cursor + 1, parenClose).trim();
      argList = splitArgs(tokens, cursor + 1, parenClose);
      endPos = tokens[parenClose]!.end;
      cursor = nextNonTrivia(tokens, parenClose + 1);
    } else {
      endPos = tokens[Math.min(cursor === -1 ? closeIdx - 1 : cursor - 1, closeIdx - 1)]!.end;
    }
    attrs.push({
      name,
      args,
      argList,
      span: { start: nameStart, end: endPos },
    });
    if (cursor !== -1 && cursor < closeIdx && tokens[cursor]!.kind === "comma") {
      cursor = nextNonTrivia(tokens, cursor + 1);
    }
  }
  return { attrs, next: closeIdx + 1 };
}


function splitArgs(tokens: readonly Token[], from: number, to: number): string[] {
  const args: string[] = [];
  let cur: string[] = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    const t = tokens[i]!;
    if (depth === 0 && t.kind === "comma") {
      args.push(joinPieces(cur).trim());
      cur = [];
      continue;
    }
    if (t.kind === "lparen" || t.kind === "lbracket" || t.kind === "lbrace") depth++;
    else if (t.kind === "rparen" || t.kind === "rbracket" || t.kind === "rbrace") depth--;
    cur.push(t.text);
  }
  const tail = joinPieces(cur).trim();
  if (tail.length > 0 || args.length > 0) args.push(tail);
  return args.map(unquoteIfString).filter((a) => a.length > 0);
}

function joinPieces(pieces: readonly string[]): string {
  return pieces.join("");
}

function unquoteIfString(arg: string): string {
  if (arg.length < 2) return arg;
  const first = arg[0];
  const last = arg[arg.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return arg.slice(1, -1);
  }
  return arg;
}

// ----------------------------------------------------------------------------
// struct
// ----------------------------------------------------------------------------

function parseStruct(
  tokens: readonly Token[],
  start: number,
  source: string,
  exported: boolean,
  attrs: M.Attr[],
  declStart: number,
  diagnostics: M.ParseDiagnostic[]
): { decl: M.StructDecl; next: number } {
  const nameIdx = nextNonTrivia(tokens, start + 1);
  if (nameIdx === -1 || tokens[nameIdx]!.kind !== "ident") {
    diagnostics.push({
      message: "expected identifier after struct",
      span: { start: tokens[start]!.end, end: tokens[start]!.end },
    });
    return { decl: emptyStruct(declStart, attrs), next: start + 1 };
  }
  const name = tokens[nameIdx]!.text;
  const braceIdx = findOpener(tokens, nameIdx + 1, "lbrace");
  if (braceIdx === -1) {
    diagnostics.push({
      message: "expected { after struct name",
      span: { start: tokens[nameIdx]!.end, end: tokens[nameIdx]!.end },
    });
    return { decl: emptyStruct(declStart, attrs), next: nameIdx + 1 };
  }
  const closeIdx = findMatching(tokens, braceIdx, "lbrace", "rbrace");
  if (closeIdx === -1) {
    diagnostics.push({
      message: "unterminated struct body",
      span: { start: tokens[braceIdx]!.start, end: tokens[braceIdx]!.end },
    });
    return { decl: emptyStruct(declStart, attrs), next: braceIdx + 1 };
  }
  const generics = joinTexts(tokens, nameIdx + 1, braceIdx).trim();
  const fields = parseStructFields(tokens, braceIdx + 1, closeIdx, source, diagnostics);

  return {
    decl: {
      kind: "struct",
      name,
      exported,
      generics,
      fields,
      attrs,
      span: { start: declStart, end: tokens[closeIdx]!.end },
    },
    next: closeIdx + 1,
  };
}

function emptyStruct(declStart: number, attrs: M.Attr[]): M.StructDecl {
  return {
    kind: "struct",
    name: "",
    exported: false,
    generics: "",
    fields: [],
    attrs,
    span: { start: declStart, end: declStart },
  };
}

function parseStructFields(
  tokens: readonly Token[],
  from: number,
  to: number,
  source: string,
  diagnostics: M.ParseDiagnostic[]
): M.StructField[] {
  // Each field: optional attrs (#[…] before), then `name [?] : type [, ;]`.
  const fields: M.StructField[] = [];
  let i = from;
  let pendingAttrs: M.Attr[] = [];

  while (i < to) {
    const t = tokens[i]!;
    if (isTrivia(t)) { i++; continue; }
    if (t.kind === "attr-open") {
      const { attrs, next } = parseAttributeBlock(tokens, i, source, diagnostics);
      for (const a of attrs) pendingAttrs.push(a);
      i = next;
      continue;
    }
    if (t.kind === "comma" || t.kind === "semi") { i++; continue; }
    if (t.kind === "ident") {
      const fieldNameTok = t;
      // Look for optional `?` then `:` then type until field separator.
      let j = nextNonTrivia(tokens, i + 1);
      let optional = false;
      if (j !== -1 && j < to && tokens[j]!.kind === "other" && tokens[j]!.text === "?") {
        optional = true;
        j = nextNonTrivia(tokens, j + 1);
      }
      if (j === -1 || j >= to || tokens[j]!.kind !== "colon") {
        diagnostics.push({
          message: `expected : after field name ${fieldNameTok.text}`,
          span: { start: fieldNameTok.start, end: fieldNameTok.end },
        });
        i++;
        continue;
      }
      const typeStart = j + 1;
      const typeEnd = findFieldEnd(tokens, typeStart, to);
      const typeText = joinTexts(tokens, typeStart, typeEnd).trim();
      fields.push({
        name: fieldNameTok.text,
        type: typeText,
        optional,
        attrs: pendingAttrs,
        span: { start: fieldNameTok.start, end: tokens[typeEnd - 1]?.end ?? fieldNameTok.end },
      });
      pendingAttrs = [];
      i = typeEnd;
      continue;
    }
    // Anything else — skip; the parser is lenient about whitespace + comments
    // inside the struct body.
    i++;
  }
  return fields;
}

/** Find the next field separator (`,` or `;`) at depth 0, or `to` if none. */
function findFieldEnd(tokens: readonly Token[], from: number, to: number): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const t = tokens[i]!;
    if (t.kind === "lparen" || t.kind === "lbracket" || t.kind === "lbrace") depth++;
    else if (t.kind === "rparen" || t.kind === "rbracket" || t.kind === "rbrace") depth--;
    if (depth === 0 && (t.kind === "comma" || t.kind === "semi")) return i;
  }
  return to;
}

// ----------------------------------------------------------------------------
// impl
// ----------------------------------------------------------------------------

function parseImpl(
  tokens: readonly Token[],
  start: number,
  source: string,
  exported: boolean,
  attrs: M.Attr[],
  declStart: number,
  diagnostics: M.ParseDiagnostic[]
): { decl: M.ImplDecl; next: number } {
  // Two header shapes:
  //   impl <Target> { … }                     ← inherent impl
  //   impl <Trait>[<Args>] for <Target> { … } ← trait impl
  const firstNameIdx = nextNonTrivia(tokens, start + 1);
  if (firstNameIdx === -1 || tokens[firstNameIdx]!.kind !== "ident") {
    diagnostics.push({
      message: "expected identifier after impl",
      span: { start: tokens[start]!.end, end: tokens[start]!.end },
    });
    return { decl: emptyImpl(declStart, attrs), next: start + 1 };
  }

  // Walk forward to find the `{` (body opener). Along the way, look for
  // a top-level `for` keyword which signals a trait impl.
  const braceIdx = findOpener(tokens, firstNameIdx + 1, "lbrace");
  if (braceIdx === -1) {
    diagnostics.push({
      message: "expected { after impl target",
      span: { start: tokens[firstNameIdx]!.end, end: tokens[firstNameIdx]!.end },
    });
    return { decl: emptyImpl(declStart, attrs), next: firstNameIdx + 1 };
  }

  let traitName: string | undefined;
  let traitArgs = "";
  let targetName = tokens[firstNameIdx]!.text;
  // Scan between the first identifier and the brace for `for <ident>`.
  for (let i = firstNameIdx + 1; i < braceIdx; i++) {
    const t = tokens[i]!;
    if (t.kind === "ident" && t.text === "for") {
      const targetIdx = nextNonTrivia(tokens, i + 1);
      if (targetIdx !== -1 && targetIdx < braceIdx && tokens[targetIdx]!.kind === "ident") {
        traitName = tokens[firstNameIdx]!.text;
        // Capture any generic args between the trait name and the `for`.
        traitArgs = joinTexts(tokens, firstNameIdx + 1, i).trim();
        targetName = tokens[targetIdx]!.text;
      }
      break;
    }
  }

  const closeIdx = findMatching(tokens, braceIdx, "lbrace", "rbrace");
  if (closeIdx === -1) {
    diagnostics.push({
      message: "unterminated impl body",
      span: { start: tokens[braceIdx]!.start, end: tokens[braceIdx]!.end },
    });
    return { decl: emptyImpl(declStart, attrs), next: braceIdx + 1 };
  }
  const methods = parseImplMethods(tokens, braceIdx + 1, closeIdx, source, diagnostics);
  return {
    decl: {
      kind: "impl",
      name: targetName,
      exported,
      traitName,
      traitArgs,
      methods,
      attrs,
      span: { start: declStart, end: tokens[closeIdx]!.end },
    },
    next: closeIdx + 1,
  };
}

function parseTrait(
  tokens: readonly Token[],
  start: number,
  source: string,
  exported: boolean,
  attrs: M.Attr[],
  declStart: number,
  diagnostics: M.ParseDiagnostic[]
): { decl: M.TraitDecl; next: number } {
  // Header: `trait Name<Generics> { ... }`
  const nameIdx = nextNonTrivia(tokens, start + 1);
  if (nameIdx === -1 || tokens[nameIdx]!.kind !== "ident") {
    diagnostics.push({
      message: "expected identifier after trait",
      span: { start: tokens[start]!.end, end: tokens[start]!.end },
    });
    return { decl: emptyTrait(declStart, attrs), next: start + 1 };
  }
  const name = tokens[nameIdx]!.text;
  const braceIdx = findOpener(tokens, nameIdx + 1, "lbrace");
  if (braceIdx === -1) {
    diagnostics.push({
      message: "expected { after trait name",
      span: { start: tokens[nameIdx]!.end, end: tokens[nameIdx]!.end },
    });
    return { decl: emptyTrait(declStart, attrs), next: nameIdx + 1 };
  }
  const generics = joinTexts(tokens, nameIdx + 1, braceIdx).trim();
  const closeIdx = findMatching(tokens, braceIdx, "lbrace", "rbrace");
  if (closeIdx === -1) {
    diagnostics.push({
      message: "unterminated trait body",
      span: { start: tokens[braceIdx]!.start, end: tokens[braceIdx]!.end },
    });
    return { decl: emptyTrait(declStart, attrs), next: braceIdx + 1 };
  }
  const methods = parseTraitMethods(tokens, braceIdx + 1, closeIdx, source, diagnostics);
  return {
    decl: {
      kind: "trait",
      name,
      exported,
      generics,
      methods,
      attrs,
      span: { start: declStart, end: tokens[closeIdx]!.end },
    },
    next: closeIdx + 1,
  };
}

function emptyTrait(declStart: number, attrs: M.Attr[]): M.TraitDecl {
  return {
    kind: "trait",
    name: "",
    exported: false,
    generics: "",
    methods: [],
    attrs,
    span: { start: declStart, end: declStart },
  };
}

/**
 * Trait body parser. Each method is one of:
 *
 *   name(params): Return;            ← required (signature only)
 *   name(params): Return { body }    ← default method
 *
 * Mirrors `parseImplMethods` but accepts `;` as a terminator and
 * captures the body as `undefined` when present.
 */
function parseTraitMethods(
  tokens: readonly Token[],
  from: number,
  to: number,
  source: string,
  diagnostics: M.ParseDiagnostic[]
): M.TraitMethod[] {
  const methods: M.TraitMethod[] = [];
  let i = from;
  let pendingAttrs: M.Attr[] = [];

  while (i < to) {
    const t = tokens[i]!;
    if (isTrivia(t)) { i++; continue; }
    if (t.kind === "attr-open") {
      const { attrs, next } = parseAttributeBlock(tokens, i, source, diagnostics);
      for (const a of attrs) pendingAttrs.push(a);
      i = next;
      continue;
    }
    if (t.kind === "ident") {
      let isAsync = false;
      let nameTokIdx = i;
      if (t.text === "async") {
        const next = nextNonTrivia(tokens, i + 1);
        if (next !== -1 && next < to && tokens[next]!.kind === "ident") {
          isAsync = true;
          nameTokIdx = next;
        }
      }
      const nameTok = tokens[nameTokIdx]!;
      const parenIdx = nextNonTrivia(tokens, nameTokIdx + 1);
      if (parenIdx === -1 || parenIdx >= to || tokens[parenIdx]!.kind !== "lparen") {
        i++;
        continue;
      }
      const parenClose = findMatching(tokens, parenIdx, "lparen", "rparen");
      if (parenClose === -1 || parenClose >= to) {
        diagnostics.push({
          message: `unterminated params for trait method ${nameTok.text}`,
          span: { start: parenIdx, end: parenIdx },
        });
        i++;
        continue;
      }

      // After the params, scan forward to either a `;` (signature-only)
      // or a `{` (default-method body).
      let termIdx = -1;
      let termKind: "semi" | "lbrace" | undefined;
      for (let j = parenClose + 1; j < to; j++) {
        const k = tokens[j]!.kind;
        if (k === "semi") { termIdx = j; termKind = "semi"; break; }
        if (k === "lbrace") { termIdx = j; termKind = "lbrace"; break; }
      }
      if (termIdx === -1) {
        diagnostics.push({
          message: `expected ; or { after trait method ${nameTok.text}`,
          span: { start: nameTok.start, end: nameTok.end },
        });
        i++;
        continue;
      }

      const params = joinTexts(tokens, parenIdx + 1, parenClose);
      let returnType = "";
      const colonIdx = findNonTriviaOfKind(tokens, parenClose + 1, termIdx, "colon");
      if (colonIdx !== -1) {
        returnType = joinTexts(tokens, colonIdx + 1, termIdx).trim();
      }
      const signature = joinTexts(tokens, parenIdx, termIdx).trim();
      let body: string | undefined;
      let nextIdx = termIdx + 1;
      if (termKind === "lbrace") {
        const bodyClose = findMatching(tokens, termIdx, "lbrace", "rbrace");
        if (bodyClose === -1 || bodyClose >= to) {
          diagnostics.push({
            message: `unterminated default body for trait method ${nameTok.text}`,
            span: { start: termIdx, end: termIdx },
          });
          i++;
          continue;
        }
        body = joinTexts(tokens, termIdx, bodyClose + 1);
        nextIdx = bodyClose + 1;
      }

      methods.push({
        name: nameTok.text,
        signature,
        params,
        returnType,
        body,
        attrs: pendingAttrs,
        isAsync,
        span: { start: nameTok.start, end: tokens[nextIdx - 1]!.end },
      });
      pendingAttrs = [];
      i = nextIdx;
      continue;
    }
    i++;
  }
  return methods;
}

function emptyImpl(declStart: number, attrs: M.Attr[]): M.ImplDecl {
  return {
    kind: "impl",
    name: "",
    exported: false,
    methods: [],
    attrs,
    span: { start: declStart, end: declStart },
  };
}

function parseImplMethods(
  tokens: readonly Token[],
  from: number,
  to: number,
  source: string,
  diagnostics: M.ParseDiagnostic[]
): M.ImplMethod[] {
  const methods: M.ImplMethod[] = [];
  let i = from;
  let pendingAttrs: M.Attr[] = [];

  while (i < to) {
    const t = tokens[i]!;
    if (isTrivia(t)) { i++; continue; }
    if (t.kind === "attr-open") {
      const { attrs, next } = parseAttributeBlock(tokens, i, source, diagnostics);
      for (const a of attrs) pendingAttrs.push(a);
      i = next;
      continue;
    }
    if (t.kind === "ident") {
      // Method form: [async] <name> ( <params> ) [: <type>] { <body> }
      let isAsync = false;
      let nameTokIdx = i;
      if (t.text === "async") {
        const next = nextNonTrivia(tokens, i + 1);
        if (next !== -1 && next < to && tokens[next]!.kind === "ident") {
          isAsync = true;
          nameTokIdx = next;
        }
      }
      const nameTok = tokens[nameTokIdx]!;
      const parenIdx = nextNonTrivia(tokens, nameTokIdx + 1);
      if (parenIdx === -1 || parenIdx >= to || tokens[parenIdx]!.kind !== "lparen") {
        // Not a method we can parse. Skip past this token to avoid an
        // infinite loop and let the next iteration recover.
        i++;
        continue;
      }
      const parenClose = findMatching(tokens, parenIdx, "lparen", "rparen");
      if (parenClose === -1 || parenClose >= to) {
        diagnostics.push({
          message: `unterminated params for method ${nameTok.text}`,
          span: { start: parenIdx, end: parenIdx },
        });
        i++;
        continue;
      }
      // Optional `: <type>` between `)` and `{`.
      let returnTypeStart = parenClose + 1;
      let bodyBraceIdx = -1;
      let depth = 0;
      for (let j = parenClose + 1; j < to; j++) {
        const k = tokens[j]!.kind;
        if (k === "lbrace") {
          if (depth === 0) { bodyBraceIdx = j; break; }
          depth++;
        } else if (k === "rbrace") depth--;
      }
      if (bodyBraceIdx === -1) {
        diagnostics.push({
          message: `expected method body for ${nameTok.text}`,
          span: { start: nameTok.start, end: nameTok.end },
        });
        i++;
        continue;
      }
      const bodyClose = findMatching(tokens, bodyBraceIdx, "lbrace", "rbrace");
      if (bodyClose === -1 || bodyClose >= to) {
        diagnostics.push({
          message: `unterminated body for method ${nameTok.text}`,
          span: { start: bodyBraceIdx, end: bodyBraceIdx },
        });
        i++;
        continue;
      }

      const params = joinTexts(tokens, parenIdx + 1, parenClose);
      let returnType = "";
      // Detect a colon between `)` and body brace.
      const colonIdx = findNonTriviaOfKind(tokens, returnTypeStart, bodyBraceIdx, "colon");
      if (colonIdx !== -1) {
        returnType = joinTexts(tokens, colonIdx + 1, bodyBraceIdx).trim();
      }
      const body = joinTexts(tokens, bodyBraceIdx, bodyClose + 1);
      const signature = joinTexts(tokens, parenIdx, bodyBraceIdx).trim();
      methods.push({
        name: nameTok.text,
        signature,
        params,
        returnType,
        body,
        attrs: pendingAttrs,
        isAsync,
        span: { start: nameTok.start, end: tokens[bodyClose]!.end },
      });
      pendingAttrs = [];
      i = bodyClose + 1;
      continue;
    }
    i++;
  }
  return methods;
}

// ----------------------------------------------------------------------------
// function
// ----------------------------------------------------------------------------

function parseFunction(
  tokens: readonly Token[],
  start: number,
  source: string,
  exported: boolean,
  attrs: M.Attr[],
  declStart: number,
  isAsync: boolean,
  diagnostics: M.ParseDiagnostic[]
): { decl: M.FunctionDecl; next: number } {
  // tokens[start] is `function` (we already consumed `async` if any).
  const nameIdx = nextNonTrivia(tokens, start + 1);
  if (nameIdx === -1 || tokens[nameIdx]!.kind !== "ident") {
    diagnostics.push({
      message: "expected identifier after function",
      span: { start: tokens[start]!.end, end: tokens[start]!.end },
    });
    return { decl: emptyFunction(declStart, attrs), next: start + 1 };
  }
  const name = tokens[nameIdx]!.text;
  const parenIdx = nextNonTrivia(tokens, nameIdx + 1);
  if (parenIdx === -1 || tokens[parenIdx]!.kind !== "lparen") {
    diagnostics.push({
      message: `expected ( after function name ${name}`,
      span: { start: tokens[nameIdx]!.end, end: tokens[nameIdx]!.end },
    });
    return { decl: emptyFunction(declStart, attrs), next: nameIdx + 1 };
  }
  const parenClose = findMatching(tokens, parenIdx, "lparen", "rparen");
  if (parenClose === -1) {
    diagnostics.push({
      message: `unterminated params for function ${name}`,
      span: { start: parenIdx, end: parenIdx },
    });
    return { decl: emptyFunction(declStart, attrs), next: parenIdx + 1 };
  }
  // Body brace at depth 0 after the close paren.
  let bodyBraceIdx = -1;
  let depth = 0;
  for (let j = parenClose + 1; j < tokens.length; j++) {
    const k = tokens[j]!.kind;
    if (k === "lbrace") {
      if (depth === 0) { bodyBraceIdx = j; break; }
      depth++;
    } else if (k === "rbrace") depth--;
  }
  if (bodyBraceIdx === -1) {
    diagnostics.push({
      message: `expected body for function ${name}`,
      span: { start: parenClose, end: parenClose },
    });
    return { decl: emptyFunction(declStart, attrs), next: parenClose + 1 };
  }
  const bodyClose = findMatching(tokens, bodyBraceIdx, "lbrace", "rbrace");
  if (bodyClose === -1) {
    diagnostics.push({
      message: `unterminated body for function ${name}`,
      span: { start: bodyBraceIdx, end: bodyBraceIdx },
    });
    return { decl: emptyFunction(declStart, attrs), next: bodyBraceIdx + 1 };
  }

  const params = joinTexts(tokens, parenIdx + 1, parenClose);
  let returnType = "";
  const colonIdx = findNonTriviaOfKind(tokens, parenClose + 1, bodyBraceIdx, "colon");
  if (colonIdx !== -1) {
    returnType = joinTexts(tokens, colonIdx + 1, bodyBraceIdx).trim();
  }
  const body = joinTexts(tokens, bodyBraceIdx, bodyClose + 1);
  const signature = joinTexts(tokens, parenIdx, bodyBraceIdx).trim();
  return {
    decl: {
      kind: "function",
      name,
      exported,
      signature,
      params,
      returnType,
      body,
      attrs,
      isAsync,
      span: { start: declStart, end: tokens[bodyClose]!.end },
    },
    next: bodyClose + 1,
  };
}

function emptyFunction(declStart: number, attrs: M.Attr[]): M.FunctionDecl {
  return {
    kind: "function",
    name: "",
    exported: false,
    signature: "",
    params: "",
    returnType: "",
    body: "",
    attrs,
    isAsync: false,
    span: { start: declStart, end: declStart },
  };
}

// ----------------------------------------------------------------------------
// Generic helpers
// ----------------------------------------------------------------------------

function isTrivia(t: Token): boolean {
  return t.kind === "ws" || t.kind === "line-comment" || t.kind === "block-comment";
}

function nextNonTrivia(tokens: readonly Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) {
    if (!isTrivia(tokens[i]!)) return i;
  }
  return -1;
}

function findOpener(tokens: readonly Token[], from: number, kind: Token["kind"]): number {
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i]!.kind === kind) return i;
  }
  return -1;
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

function findClosingBracket(tokens: readonly Token[], from: number): number {
  let depth = 1;
  for (let i = from; i < tokens.length; i++) {
    const k = tokens[i]!.kind;
    if (k === "lbracket") depth++;
    else if (k === "rbracket") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findNonTriviaOfKind(
  tokens: readonly Token[],
  from: number,
  to: number,
  kind: Token["kind"]
): number {
  for (let i = from; i < to; i++) {
    if (tokens[i]!.kind === kind) return i;
  }
  return -1;
}

function joinTexts(tokens: readonly Token[], from: number, to: number): string {
  let out = "";
  for (let i = from; i < to; i++) out += tokens[i]!.text;
  return out;
}
