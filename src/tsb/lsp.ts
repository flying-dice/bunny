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

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "./parser/index.ts";
import * as M from "./ast/index.ts";
import { transpile } from "./compiler.ts";

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

/**
 * Symbol harvested from another .tsb file in the workspace. Powers
 * cross-file completion / hover / goto — when the user types
 * `(product: Pr` in `controllers/X.tsb`, the `Product` struct
 * declared in `entities/Product.tsb` shows up.
 */
interface WorkspaceSymbol {
  name: string;
  kind: "struct" | "trait" | "function" | "impl";
  uri: string;
  /** Range of the declaration in its source file. */
  range: Range;
  /** Short detail line for the completion item / hover. */
  detail: string;
  /**
   * Rust-style doc comment block immediately preceding the
   * declaration — either `///` line comments, or a block comment
   * starting with double-asterisk. Markdown body, ready to render
   * in the hover popup and completion preview.
   */
  doc?: string;
}

/** Run the LSP. Resolves when the client closes stdin. */
export async function runLsp(): Promise<void> {
  const docs = new Map<string, DocState>();
  const workspaceSymbols = new Map<string, WorkspaceSymbol>();
  const workspaceRoots: string[] = [];

  await readMessages(async (msg) => {
    if (msg.method === "initialize") {
      // Capture workspace roots from the initialize params for the
      // background symbol scan that fires on `initialized`.
      const params = (msg.params ?? {}) as {
        workspaceFolders?: { uri: string }[];
        rootUri?: string;
      };
      const folders = params.workspaceFolders ?? (params.rootUri ? [{ uri: params.rootUri }] : []);
      for (const f of folders) {
        try {
          workspaceRoots.push(fileURLToPath(f.uri));
        } catch {
          /* malformed uri — ignore */
        }
      }
      respond(msg.id!, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 /* Full */ },
          completionProvider: { triggerCharacters: ["#", "[", "(", "@", ":", " "] },
          hoverProvider: true,
          definitionProvider: true,
        },
        serverInfo: { name: "bunny tsb", version: "0.1.0" },
      });
      return;
    }
    if (msg.method === "initialized") {
      // Background scan — don't block the LSP startup handshake.
      void rebuildWorkspaceSymbols(workspaceRoots, workspaceSymbols);
      return;
    }
    if (msg.method === "shutdown") { respond(msg.id!, null); return; }
    if (msg.method === "exit") process.exit(0);

    if (msg.method === "textDocument/didOpen") {
      const p = msg.params as { textDocument: { uri: string; text: string } };
      await setDoc(docs, p.textDocument.uri, p.textDocument.text);
      await publishDiagnostics(p.textDocument.uri, p.textDocument.text);
      return;
    }
    if (msg.method === "textDocument/didChange") {
      const p = msg.params as { textDocument: { uri: string }; contentChanges: { text: string }[] };
      const text = p.contentChanges[0]?.text ?? "";
      await setDoc(docs, p.textDocument.uri, text);
      // Refresh the workspace entry for this file so newly-declared
      // structs / functions show up in other open documents' completions.
      updateWorkspaceSymbolsForFile(p.textDocument.uri, text, workspaceSymbols);
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
      respond(msg.id!, doc ? completionsAt(doc, p.position, workspaceSymbols) : { isIncomplete: false, items: [] });
      return;
    }
    if (msg.method === "textDocument/hover") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? hoverAt(doc, p.position, workspaceSymbols) : null);
      return;
    }
    if (msg.method === "textDocument/definition") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? definitionAt(doc, p.position, p.textDocument.uri, workspaceSymbols) : null);
      return;
    }

    // Unhandled request — reply with method-not-found so the client
    // doesn't hang waiting.
    if (msg.id !== undefined && msg.method) {
      write({ jsonrpc: "2.0", id: msg.id as number | string, error: { code: -32601, message: `method not found: ${msg.method}` } });
    }
  });
}

async function setDoc(docs: Map<string, DocState>, uri: string, text: string): Promise<void> {
  let module: M.Module | undefined;
  try {
    module = (await parse(text)).module;
  } catch {
    module = undefined;
  }
  docs.set(uri, { text, module });
}

/**
 * Walk every workspace root, find every `.tsb` file, parse it, and
 * load its top-level declarations into the workspace symbol table.
 * Runs once on `initialized` and is incrementally updated on every
 * `didChange` by `updateWorkspaceSymbolsForFile`.
 */
async function rebuildWorkspaceSymbols(
  roots: readonly string[],
  out: Map<string, WorkspaceSymbol>,
): Promise<void> {
  out.clear();
  for (const root of roots) {
    const glob = new Bun.Glob("**/*.tsb");
    for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
      const abs = `${root}/${rel}`;
      let text: string;
      try {
        text = readFileSync(abs, "utf-8");
      } catch {
        continue;
      }
      const uri = pathToFileURL(abs).href;
      await harvestSymbols(uri, text, out);
    }
  }
}

async function updateWorkspaceSymbolsForFile(
  uri: string,
  text: string,
  out: Map<string, WorkspaceSymbol>,
): Promise<void> {
  // Drop any symbols previously sourced from this file before
  // re-harvesting — handles renames / deletions of declarations.
  for (const [k, sym] of out) {
    if (sym.uri === uri) out.delete(k);
  }
  await harvestSymbols(uri, text, out);
}

async function harvestSymbols(
  uri: string,
  text: string,
  out: Map<string, WorkspaceSymbol>,
): Promise<void> {
  let module: M.Module | undefined;
  try {
    module = (await parse(text)).module;
  } catch {
    return;
  }
  for (const part of module.parts) {
    if (part.kind === "opaque") continue;
    const range = offsetsToRange(text, part.span.start, part.span.end);
    const key = `${part.kind}:${part.name}`;
    const detail = describePart(part);
    const doc = extractDocBefore(text, part.span.start);
    out.set(key, {
      name: part.name,
      kind: part.kind,
      uri,
      range,
      detail,
      doc,
    });
  }
}

// Walk backward from `beforeIndex` collecting a contiguous Rust-style
// doc comment block — either `///` line comments OR a single block
// comment opening with double-asterisk — ending right before the
// declaration. Returns the unwrapped markdown body, or undefined when
// nothing's there.
function extractDocBefore(text: string, beforeIndex: number): string | undefined {
  // Skip whitespace/blank lines between the declaration and any docs.
  let i = beforeIndex - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) {
    i--;
  }
  if (i < 0) return undefined;

  // Try block-doc form first: comment ends with star-slash.
  if (text[i] === "/" && text[i - 1] === "*") {
    let j = i - 2;
    while (j >= 1) {
      // Match slash-star-star opener.
      if (text[j] === "*" && text[j - 1] === "/" && text[j + 1] === "*") {
        const body = text.slice(j + 2, i - 1);
        return cleanBlockDoc(body);
      }
      j--;
    }
    return undefined;
  }

  // Line-doc form: contiguous `///` lines.
  const lines: string[] = [];
  // Position `i` is currently at the last char of a possible doc line.
  // Scan back finding each `///` line and prepending.
  while (i >= 0) {
    // Walk to the start of the current line.
    let lineStart = i;
    while (lineStart > 0 && text[lineStart - 1] !== "\n") lineStart--;
    const line = text.slice(lineStart, i + 1);
    const trimmed = line.replace(/^\s+/, "");
    if (trimmed.startsWith("///")) {
      lines.unshift(trimmed.slice(3).replace(/^ /, ""));
      i = lineStart - 1;
      // Skip the newline + any whitespace at the end of the prev line.
      while (i >= 0 && (text[i] === "\n" || text[i] === "\r" || text[i] === " " || text[i] === "\t")) i--;
    } else {
      break;
    }
  }
  if (lines.length === 0) return undefined;
  return lines.join("\n").trim();
}

function cleanBlockDoc(body: string): string {
  // Each line inside a block doc typically starts with whitespace + a
  // leading asterisk. Strip that to get the markdown body.
  return body
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
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

const KEYWORDS = ["struct", "impl", "trait", "match", "for", "Self", "function", "export", "type", "import", "from", "as", "let", "const", "return", "if", "else", "async", "await"];
const DERIVE_NAMES = ["Clone", "Equals", "ToJson", "Display", "Default", "Hash"];
const CONSTRAINT_MACROS = ["minLength", "maxLength", "minimum", "maximum", "format", "pattern"];
const ROUTE_MACROS = ["get", "post", "put", "patch", "delete", "head", "options"];

interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  insertText?: string;
  /** Markdown body. Zed shows this in the completion preview pane. */
  documentation?: { kind: "markdown"; value: string };
}

function completionsAt(
  doc: DocState,
  pos: Position,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): { isIncomplete: false; items: CompletionItem[] } {
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

  // Type position — after `:` in a parameter / return / field / `as`
  // annotation. Suggest types only (structs + traits from the
  // current file AND the workspace).
  if (/:\s*\w*$/.test(before) || /\bas\s+\w*$/.test(before) || /\bimpl\b[^{]*\bfor\s+\w*$/.test(before)) {
    addTypeCompletions(doc, workspace, items);
    return { isIncomplete: false, items };
  }

  // General context: keywords + every visible name (workspace +
  // local). Cross-file struct/trait/function names show up here so
  // call sites can autocomplete.
  for (const k of KEYWORDS) items.push({ label: k, kind: 14 /* Keyword */ });
  for (const sym of workspace.values()) {
    items.push(symbolToCompletion(sym));
  }
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "opaque") continue;
      // Local symbols can shadow workspace entries with the same name
      // — dedupe by removing the workspace entry that matches.
      const idx = items.findIndex((i) => i.label === p.name && (i.kind === 22 || i.kind === 3));
      if (idx >= 0) items.splice(idx, 1);
      items.push(localPartToCompletion(p, doc.text));
    }
  }
  return { isIncomplete: false, items };
}

function symbolToCompletion(sym: WorkspaceSymbol): CompletionItem {
  return {
    label: sym.name,
    kind: kindFor(sym.kind),
    detail: sym.detail,
    documentation: sym.doc ? { kind: "markdown", value: sym.doc } : undefined,
  };
}

function localPartToCompletion(part: M.ModulePart, sourceText: string): CompletionItem {
  if (part.kind === "opaque") {
    return { label: "", kind: 0 };
  }
  const doc = extractDocBefore(sourceText, part.span.start);
  return {
    label: part.name,
    kind: kindFor(part.kind),
    detail: describePart(part),
    documentation: doc ? { kind: "markdown", value: doc } : undefined,
  };
}

function addTypeCompletions(
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
  items: CompletionItem[],
): void {
  for (const t of ["string", "number", "boolean", "void", "any", "unknown", "never"]) {
    items.push({ label: t, kind: 14, detail: "primitive type" });
  }
  for (const sym of workspace.values()) {
    if (sym.kind === "struct" || sym.kind === "trait") {
      items.push(symbolToCompletion(sym));
    }
  }
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "struct" || p.kind === "trait") {
        const idx = items.findIndex((i) => i.label === p.name);
        if (idx >= 0) items.splice(idx, 1);
        items.push(localPartToCompletion(p, doc.text));
      }
    }
  }
}

function kindFor(symKind: "struct" | "trait" | "function" | "impl"): number {
  switch (symKind) {
    case "struct": return 22 /* Struct */;
    case "trait": return 8 /* Interface */;
    case "function": return 3 /* Function */;
    case "impl": return 22;
  }
}

function describePart(p: M.ModulePart): string {
  if (p.kind === "struct") {
    const f = p.fields.map((x) => `${x.name}: ${x.type}`).join(", ");
    return `struct ${p.name} { ${f} }`;
  }
  if (p.kind === "trait") return `trait ${p.name}`;
  if (p.kind === "function") return `fn ${p.name}${p.signature}`;
  if (p.kind === "impl") {
    return p.traitName ? `impl ${p.traitName} for ${p.name}` : `impl ${p.name}`;
  }
  return "";
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

function hoverAt(
  doc: DocState,
  pos: Position,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): Hover | null {
  const word = wordAt(doc.text, pos);
  if (!word) return null;
  const md = MACRO_DOCS[word.text];
  if (md) {
    return { contents: { kind: "markdown", value: `**${word.text}** — ${md}` }, range: word.range };
  }
  // Local declarations win over workspace entries.
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "opaque") continue;
      if (p.name === word.text) {
        const localDoc = extractDocBefore(doc.text, p.span.start);
        return {
          contents: { kind: "markdown", value: hoverMarkdown(describePart(p), localDoc) },
          range: word.range,
        };
      }
    }
  }
  for (const sym of workspace.values()) {
    if (sym.name === word.text) {
      return {
        contents: { kind: "markdown", value: hoverMarkdown(sym.detail, sym.doc) },
        range: word.range,
      };
    }
  }
  return null;
}

function hoverMarkdown(signature: string, doc: string | undefined): string {
  // Code-block the signature so editors render it in monospace, then
  // append the doc body (which is plain markdown already).
  const sigBlock = "```tsb\n" + signature + "\n```";
  return doc ? `${sigBlock}\n\n${doc}` : sigBlock;
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

interface Location { uri: string; range: Range }

function definitionAt(
  doc: DocState,
  pos: Position,
  uri: string,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): Location | null {
  const word = wordAt(doc.text, pos);
  if (!word) return null;
  // Same-file first — keeps `goto definition` snappy when the user
  // is already on the declaring file.
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "opaque") continue;
      if (p.name === word.text && !(p.kind === "impl" && p.traitName)) {
        return { uri, range: offsetsToRange(doc.text, p.span.start, p.span.end) };
      }
    }
  }
  for (const sym of workspace.values()) {
    if (sym.name === word.text) {
      return { uri: sym.uri, range: sym.range };
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
