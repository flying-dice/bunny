/**
 * Stdio Language Server for `.tsb`. Speaks LSP JSON-RPC framed with
 * `Content-Length` headers.
 *
 * Wired up:
 *   - `initialize` / `initialized` / `shutdown` / `exit`
 *   - `textDocument/didOpen` + `didChange` + `didClose` (full sync)
 *   - `textDocument/publishDiagnostics` from the tsb parser/emitter
 *   - `textDocument/completion` — keywords, derive macros, route macros,
 *     constraint macros, struct names visible in the current file
 *   - `textDocument/hover` — shows the declaration text under the cursor
 *     for structs / impls / functions / macros
 *   - `textDocument/definition` — jumps to the declaration site of a
 *     struct or function reference
 *
 * Volar integration is the longer-term plan (for ts-language-service
 * features against the lowered output); this native impl gives editors
 * a useful surface without that dependency.
 */

import { parse } from "./parser.ts";
import * as M from "./model.ts";
import { transpile } from "./transpile.ts";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Position { line: number; character: number }
interface Range { start: Position; end: Position }

interface LspDiagnostic {
  range: Range;
  severity: 1 | 2 | 3 | 4;
  source: "tsb";
  message: string;
}

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

interface DocState {
  text: string;
  module?: M.Module;
}

/** Run the LSP. Resolves when the client closes stdin. */
export async function runLsp(): Promise<void> {
  const docs = new Map<string, DocState>();

  await readMessages(async (msg) => {
    if (msg.method === "initialize") {
      respond(msg.id!, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 /* Full */ },
          completionProvider: { triggerCharacters: ["#", "[", "(", "@"] },
          hoverProvider: true,
          definitionProvider: true,
        },
        serverInfo: { name: "bunny tsb", version: "0.1.0" },
      });
      return;
    }
    if (msg.method === "initialized") return;
    if (msg.method === "shutdown") { respond(msg.id!, null); return; }
    if (msg.method === "exit") process.exit(0);

    if (msg.method === "textDocument/didOpen") {
      const p = msg.params as { textDocument: { uri: string; text: string } };
      setDoc(docs, p.textDocument.uri, p.textDocument.text);
      await publishDiagnostics(p.textDocument.uri, p.textDocument.text);
      return;
    }
    if (msg.method === "textDocument/didChange") {
      const p = msg.params as { textDocument: { uri: string }; contentChanges: { text: string }[] };
      const text = p.contentChanges[0]?.text ?? "";
      setDoc(docs, p.textDocument.uri, text);
      await publishDiagnostics(p.textDocument.uri, text);
      return;
    }
    if (msg.method === "textDocument/didClose") {
      const p = msg.params as { textDocument: { uri: string } };
      docs.delete(p.textDocument.uri);
      notify("textDocument/publishDiagnostics", { uri: p.textDocument.uri, diagnostics: [] });
      return;
    }

    if (msg.method === "textDocument/completion") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? completionsAt(doc, p.position) : { isIncomplete: false, items: [] });
      return;
    }
    if (msg.method === "textDocument/hover") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? hoverAt(doc, p.position) : null);
      return;
    }
    if (msg.method === "textDocument/definition") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? definitionAt(doc, p.position, p.textDocument.uri) : null);
      return;
    }

    // Unhandled request — reply with method-not-found so the client
    // doesn't hang waiting.
    if (msg.id !== undefined && msg.method) {
      write({ jsonrpc: "2.0", id: msg.id as number | string, error: { code: -32601, message: `method not found: ${msg.method}` } });
    }
  });
}

function setDoc(docs: Map<string, DocState>, uri: string, text: string): void {
  let module: M.Module | undefined;
  try {
    module = parse(text).module;
  } catch {
    module = undefined;
  }
  docs.set(uri, { text, module });
}

async function publishDiagnostics(uri: string, text: string): Promise<void> {
  let diagnostics: LspDiagnostic[] = [];
  try {
    const result = await transpile(text);
    diagnostics = result.diagnostics.map((d) => ({
      range: offsetsToRange(text, d.span.start, d.span.end),
      severity: 1,
      source: "tsb" as const,
      message: d.message,
    }));
  } catch (err) {
    diagnostics = [{
      range: zeroRange(),
      severity: 1,
      source: "tsb",
      message: err instanceof Error ? err.message : String(err),
    }];
  }
  const params: PublishDiagnosticsParams = { uri, diagnostics };
  notify("textDocument/publishDiagnostics", params);
}

// ----------------------------------------------------------------------------
// Completion
// ----------------------------------------------------------------------------

const KEYWORDS = ["struct", "impl", "match", "for", "From", "Into", "fn", "export", "type", "interface", "import"];
const DERIVE_NAMES = ["Clone", "Equals", "ToJson", "Display", "Default", "Hash"];
const CONSTRAINT_MACROS = ["minLength", "maxLength", "minimum", "maximum", "format", "pattern"];
const ROUTE_MACROS = ["get", "post", "put", "patch", "delete", "head", "options"];

interface CompletionItem { label: string; kind: number; detail?: string; insertText?: string }

function completionsAt(doc: DocState, pos: Position): { isIncomplete: false; items: CompletionItem[] } {
  const offset = positionToOffset(doc.text, pos);
  const before = doc.text.slice(0, offset);
  const items: CompletionItem[] = [];

  // Inside `#[derive(…)]`: suggest derive names.
  if (/#\[derive\([^)]*$/.test(before)) {
    for (const n of DERIVE_NAMES) items.push({ label: n, kind: 7 /* Class */, detail: "derive macro" });
    return { isIncomplete: false, items };
  }

  // Inside `#[…]` (attribute slot): suggest constraint + route macros.
  if (/#\[[^\]\n]*$/.test(before)) {
    for (const n of CONSTRAINT_MACROS) items.push({ label: n, kind: 3 /* Function */, detail: "field constraint" });
    for (const n of ROUTE_MACROS) items.push({ label: n, kind: 3, detail: "http route" });
    items.push({ label: "derive", kind: 3, detail: "derive macros" });
    return { isIncomplete: false, items };
  }

  // After `impl … for `: suggest struct names from the current module.
  if (/\bimpl\b[^{]*\bfor\s+\w*$/.test(before) && doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "struct") items.push({ label: p.name, kind: 22 /* Struct */ });
    }
    return { isIncomplete: false, items };
  }

  // General context: keywords + visible struct/function names.
  for (const k of KEYWORDS) items.push({ label: k, kind: 14 /* Keyword */ });
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "struct") items.push({ label: p.name, kind: 22 });
      else if (p.kind === "function") items.push({ label: p.name, kind: 3 });
    }
  }
  return { isIncomplete: false, items };
}

// ----------------------------------------------------------------------------
// Hover
// ----------------------------------------------------------------------------

interface Hover { contents: { kind: "markdown"; value: string }; range?: Range }

const MACRO_DOCS: Record<string, string> = {
  derive: "Derive macros append generated methods (e.g. `clone`, `equals`) to the impl.",
  minLength: "Field constraint: `string.length >= n`.",
  maxLength: "Field constraint: `string.length <= n`.",
  minimum: "Field constraint: `number >= n`.",
  maximum: "Field constraint: `number <= n`.",
  format: "Field constraint: value must match the named format (uuid, email, …).",
  pattern: "Field constraint: value must match the supplied regex pattern.",
  get: "Function attribute: registers an HTTP GET route at the given path.",
  post: "Function attribute: registers an HTTP POST route at the given path.",
  put: "Function attribute: registers an HTTP PUT route at the given path.",
  patch: "Function attribute: registers an HTTP PATCH route at the given path.",
  delete: "Function attribute: registers an HTTP DELETE route at the given path.",
  head: "Function attribute: registers an HTTP HEAD route at the given path.",
  options: "Function attribute: registers an HTTP OPTIONS route at the given path.",
  Clone: "Derive: emits `clone(self) -> Self`.",
  Equals: "Derive: emits `equals(a, b) -> boolean`.",
  ToJson: "Derive: emits `toJson(self)` and `fromJson(s)`.",
  Display: "Derive: emits `toString(self) -> string`.",
  Default: "Derive: emits `default() -> Self` using zero-values or `#[default]` attrs.",
  Hash: "Derive: emits `hash(self) -> string` using a stable JSON-FNV mix.",
};

function hoverAt(doc: DocState, pos: Position): Hover | null {
  const word = wordAt(doc.text, pos);
  if (!word) return null;
  const md = MACRO_DOCS[word.text];
  if (md) {
    return { contents: { kind: "markdown", value: `**${word.text}** — ${md}` }, range: word.range };
  }
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "struct" && p.name === word.text) {
        const fields = p.fields.map((f) => `${f.name}: ${f.type}`).join(", ");
        return {
          contents: { kind: "markdown", value: `**struct ${p.name}** { ${fields} }` },
          range: word.range,
        };
      }
      if (p.kind === "function" && p.name === word.text) {
        return {
          contents: { kind: "markdown", value: `**fn ${p.name}**${p.signature}` },
          range: word.range,
        };
      }
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

interface Location { uri: string; range: Range }

function definitionAt(doc: DocState, pos: Position, uri: string): Location | null {
  const word = wordAt(doc.text, pos);
  if (!word || !doc.module) return null;
  for (const p of doc.module.parts) {
    if ((p.kind === "struct" || p.kind === "function") && p.name === word.text) {
      return { uri, range: offsetsToRange(doc.text, p.span.start, p.span.end) };
    }
    if (p.kind === "impl" && p.name === word.text && !p.traitName) {
      return { uri, range: offsetsToRange(doc.text, p.span.start, p.span.end) };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Text utilities
// ----------------------------------------------------------------------------

function wordAt(text: string, pos: Position): { text: string; range: Range } | null {
  const offset = positionToOffset(text, pos);
  let start = offset;
  let end = offset;
  while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1] ?? "")) start--;
  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end] ?? "")) end++;
  if (end === start) return null;
  return {
    text: text.slice(start, end),
    range: offsetsToRange(text, start, end),
  };
}

function offsetsToRange(text: string, start: number, end: number): Range {
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) };
}

function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { line++; lastLineStart = i + 1; }
  }
  return { line, character: Math.max(0, offset - lastLineStart) };
}

function positionToOffset(text: string, pos: Position): number {
  let line = 0;
  let i = 0;
  while (i < text.length && line < pos.line) {
    if (text.charCodeAt(i) === 10) line++;
    i++;
  }
  return Math.min(text.length, i + pos.character);
}

function zeroRange(): Range { return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }; }

// ----------------------------------------------------------------------------
// stdio JSON-RPC framing
// ----------------------------------------------------------------------------

function write(msg: JsonRpcMessage): void {
  const body = JSON.stringify(msg);
  const bytes = Buffer.byteLength(body, "utf-8");
  process.stdout.write(`Content-Length: ${bytes}\r\n\r\n${body}`);
}

function respond(id: number | string | null, result: unknown): void {
  write({ jsonrpc: "2.0", id: id as number | string | undefined, result });
}

function notify(method: string, params: unknown): void {
  write({ jsonrpc: "2.0", method, params });
}

async function readMessages(handler: (msg: JsonRpcMessage) => Promise<void>): Promise<void> {
  let buf = Buffer.alloc(0);
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buf.subarray(0, headerEnd).toString("utf-8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buf = buf.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buf.length < bodyStart + length) break;
      const body = buf.subarray(bodyStart, bodyStart + length).toString("utf-8");
      buf = buf.subarray(bodyStart + length);
      try {
        const msg = JSON.parse(body) as JsonRpcMessage;
        await handler(msg);
      } catch (err) {
        process.stderr.write(
          `tsb-lsp: failed to handle message: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    }
  }
}
