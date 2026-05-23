/**
 * Stdio Language Server for `.neoc`. Speaks LSP JSON-RPC framed with
 * `Content-Length` headers.
 *
 * Wired up:
 *   - `initialize` / `initialized` / `shutdown` / `exit`
 *   - `textDocument/didOpen` + `didChange` + `didClose` (full sync)
 *   - `textDocument/publishDiagnostics` from the neoc parser/emitter
 *   - `textDocument/completion` — Lua + neoc keywords, derive and
 *     constraint macros, struct / trait / function names visible in
 *     the workspace, struct fields via `self.` / `Self.` / `<param>.`
 *   - `textDocument/hover` — shows the declaration text under the cursor
 *     for structs / impls / functions / macros
 *   - `textDocument/definition` — jumps to the declaration site of a
 *     struct or function reference
 *   - `textDocument/codeAction` — quick-fix that stubs every missing
 *     required method on an `impl Trait for X { }` block.
 *   - `textDocument/documentSymbol` — outline of every top-level
 *     declaration plus its fields / methods, used to populate editor
 *     structure panels.
 *   - `textDocument/prepareRename` — validates the cursor position
 *     and returns the symbol's range plus a placeholder for the
 *     editor's rename prompt.
 *   - `textDocument/rename` — word-boundary scan across every
 *     `.neoc` file in the workspace, grouping `TextEdit`s by URI
 *     into a `WorkspaceEdit`. Skips occurrences inside string
 *     literals and line comments.
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
  source: "neoc";
  message: string;
  /** Stable diagnostic ID. Code actions match on this. */
  code?: string;
  /** Free-form payload attached to the diagnostic for code-action use. */
  data?: unknown;
}

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

interface CodeActionParams {
  textDocument: { uri: string };
  range: Range;
  context: { diagnostics: LspDiagnostic[] };
}

interface TextEdit { range: Range; newText: string }

interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>;
}

interface CodeAction {
  title: string;
  kind: "quickfix";
  diagnostics?: LspDiagnostic[];
  edit?: WorkspaceEdit;
  isPreferred?: boolean;
}

/**
 * Parameters for `textDocument/rename`. The editor sends the cursor
 * position and the new name; the server responds with a workspace-wide
 * `WorkspaceEdit` that replaces every occurrence.
 */
export interface RenameParams {
  textDocument: { uri: string };
  position: Position;
  newName: string;
}

/**
 * Result of `textDocument/prepareRename`. Returns the range of the
 * symbol under the cursor plus a suggested placeholder for the rename
 * prompt, or `null` when the cursor isn't on a renameable token.
 */
export interface PrepareRenameResult {
  range: Range;
  placeholder: string;
}

/**
 * LSP `SymbolKind` integer constants — the subset neoc uses for its
 * document-symbol outline. Mirrors the LSP spec verbatim.
 */
export const SymbolKind = {
  Class: 5,
  Method: 6,
  Field: 8,
  Interface: 11,
  Function: 12,
  Struct: 23,
} as const;

export type SymbolKindValue = typeof SymbolKind[keyof typeof SymbolKind];

/**
 * One entry in the document-symbol outline. Matches the LSP
 * `DocumentSymbol` shape: `range` covers the whole declaration,
 * `selectionRange` covers just the name (where the cursor lands when
 * the client picks the symbol), and `children` nests fields under
 * structs / methods under impls and traits.
 */
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKindValue;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

interface MissingTraitMethodsData {
  implName: string;
  implSpan: { start: number; end: number };
  missing: Array<{
    name: string;
    signature: string;
    isAsync: boolean;
    hasDefault: boolean;
  }>;
}

export interface DocState {
  text: string;
  module?: M.Module;
}

/**
 * Symbol harvested from another .neoc file in the workspace. Powers
 * cross-file completion / hover / goto — when the user types
 * `(product: Pr` in `controllers/X.neoc`, the `Product` struct
 * declared in `entities/Product.neoc` shows up.
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
  /**
   * For trait declarations: the method signatures clients need to
   * implement. Used to seed `impl Trait for X {}` completions.
   */
  traitMethods?: TraitMethodSig[];
  /**
   * For struct declarations: the declared fields. Used to power
   * `self.` / `value.` member-access completions inside impl bodies
   * and call sites.
   */
  structFields?: StructFieldSig[];
}

interface TraitMethodSig {
  name: string;
  signature: string;
  hasDefault: boolean;
  isAsync: boolean;
  doc?: string;
}

interface StructFieldSig {
  name: string;
  type: string;
  optional: boolean;
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
          completionProvider: {
            // Symbol triggers cover the type / attribute / member paths;
            // the letter list ensures Zed and other clients that only
            // auto-invoke on declared trigger chars still pop the
            // completion list while the user is typing an identifier.
            triggerCharacters: [
              "#", "[", "(", "@", ":", " ", ".",
              "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
              "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
              "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
              "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
              "_",
            ],
          },
          hoverProvider: true,
          definitionProvider: true,
          codeActionProvider: { codeActionKinds: ["quickfix"] },
          documentSymbolProvider: true,
          renameProvider: { prepareProvider: true },
        },
        serverInfo: { name: "neoc neoc", version: "0.1.0" },
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
      await publishDiagnostics(p.textDocument.uri, p.textDocument.text, docs, workspaceSymbols);
      return;
    }
    if (msg.method === "textDocument/didChange") {
      const p = msg.params as { textDocument: { uri: string }; contentChanges: { text: string }[] };
      const text = p.contentChanges[0]?.text ?? "";
      await setDoc(docs, p.textDocument.uri, text);
      // Refresh the workspace entry for this file so newly-declared
      // structs / functions show up in other open documents' completions.
      updateWorkspaceSymbolsForFile(p.textDocument.uri, text, workspaceSymbols);
      await publishDiagnostics(p.textDocument.uri, text, docs, workspaceSymbols);
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
    if (msg.method === "textDocument/codeAction") {
      const p = msg.params as CodeActionParams;
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? codeActionsAt(doc, p, workspaceSymbols) : []);
      return;
    }
    if (msg.method === "textDocument/documentSymbol") {
      const p = msg.params as { textDocument: { uri: string } };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? documentSymbolsFor(doc) : []);
      return;
    }
    if (msg.method === "textDocument/prepareRename") {
      const p = msg.params as { textDocument: { uri: string }; position: Position };
      const doc = docs.get(p.textDocument.uri);
      respond(msg.id!, doc ? prepareRenameAt(doc, p.position, workspaceSymbols) : null);
      return;
    }
    if (msg.method === "textDocument/rename") {
      const p = msg.params as RenameParams;
      const doc = docs.get(p.textDocument.uri);
      if (!doc) { respond(msg.id!, null); return; }
      const edit = await renameSymbol(doc, p.position, p.newName, workspaceRoots, p.textDocument.uri);
      respond(msg.id!, edit);
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
 * Walk every workspace root, find every `.neoc` file, parse it, and
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
    const glob = new Bun.Glob("**/*.neoc");
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
    const traitMethods = part.kind === "trait" ? collectTraitMethodSigs(part, text) : undefined;
    const structFields = part.kind === "struct" ? collectStructFieldSigs(part, text) : undefined;
    out.set(key, {
      name: part.name,
      kind: part.kind,
      uri,
      range,
      detail,
      doc,
      traitMethods,
      structFields,
    });
  }
}

function collectTraitMethodSigs(trait: M.TraitDecl, text: string): TraitMethodSig[] {
  return trait.methods.map((m) => ({
    name: m.name,
    signature: m.signature,
    hasDefault: m.body !== undefined,
    isAsync: m.isAsync,
    doc: extractDocBefore(text, m.span.start),
  }));
}

function collectStructFieldSigs(struct: M.StructDecl, text: string): StructFieldSig[] {
  return struct.fields.map((f) => ({
    name: f.name,
    type: f.type,
    optional: f.optional,
    doc: extractDocBefore(text, f.span.start),
  }));
}

// Walk backward from `beforeIndex` collecting a contiguous Rust-style
// doc comment block — either `///` line comments OR a single block
// comment opening with double-asterisk — ending right before the
// declaration. Returns the unwrapped markdown body, or undefined when
// nothing's there.
function extractDocBefore(text: string, beforeIndex: number): string | undefined {
  let i = beforeIndex - 1;
  // Skip whitespace, and any `#[...]` attribute macros that sit
  // between the docs and the declaration keyword. Loop because a
  // declaration can carry multiple attributes.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    while (i >= 0 && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i--;
    if (i < 0) return undefined;
    if (text[i] !== "]") break;
    // Walk back to the matching `#[`.
    let depth = 1;
    let j = i - 1;
    while (j >= 0 && depth > 0) {
      const ch = text[j];
      if (ch === "]") depth++;
      else if (ch === "[") depth--;
      if (depth === 0) break;
      j--;
    }
    if (j < 1 || text[j - 1] !== "#") return undefined;
    i = j - 2; // step past `#[`
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

async function publishDiagnostics(
  uri: string,
  text: string,
  docs: Map<string, DocState>,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): Promise<void> {
  let diagnostics: LspDiagnostic[] = [];
  try {
    const result = await transpile(text);
    diagnostics = result.diagnostics.map((d) => ({
      range: offsetsToRange(text, d.span.start, d.span.end),
      severity: 1,
      source: "neoc" as const,
      message: d.message,
    }));
  } catch (err) {
    diagnostics = [{
      range: zeroRange(),
      severity: 1,
      source: "neoc",
      message: err instanceof Error ? err.message : String(err),
    }];
  }
  const docState = docs.get(uri);
  if (docState) {
    diagnostics.push(...missingTraitMethodDiagnostics(docState, workspace));
  }
  const params: PublishDiagnosticsParams = { uri, diagnostics };
  notify("textDocument/publishDiagnostics", params);
}

// One warning per `impl Trait for X { … }` block that's missing any
// required trait methods. The diagnostic carries `data` describing
// every missing signature so a code-action handler can stub them in
// without re-resolving the trait.
function missingTraitMethodDiagnostics(
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): LspDiagnostic[] {
  if (!doc.module) return [];
  const out: LspDiagnostic[] = [];
  for (const part of doc.module.parts) {
    if (part.kind !== "impl" || !part.traitName) continue;
    const methods = resolveTraitMethods(part.traitName, doc, workspace);
    if (!methods) continue;
    const implemented = new Set(part.methods.map((m) => m.name));
    // Methods with a default body aren't "missing" — the trait
    // already provides them. Only flag required (signature-only)
    // methods that the impl block hasn't supplied.
    const missing = methods.filter((m) => !implemented.has(m.name) && !m.hasDefault);
    if (missing.length === 0) continue;
    // Range covers the impl header only — the `impl Trait for X {`
    // line — so the squiggle is anchored to the declaration.
    const head = doc.text.slice(part.span.start, part.span.end);
    const braceRel = head.indexOf("{");
    const headEnd = braceRel >= 0 ? part.span.start + braceRel + 1 : part.span.end;
    out.push({
      range: offsetsToRange(doc.text, part.span.start, headEnd),
      severity: 2 /* Warning */,
      source: "neoc",
      message: missingMessage(part.traitName, missing),
      code: "neoc/missing-trait-methods",
      data: {
        implName: part.name,
        implSpan: part.span,
        missing: missing.map((m) => ({
          name: m.name,
          signature: m.signature,
          isAsync: m.isAsync,
          hasDefault: m.hasDefault,
        })),
      },
    });
  }
  return out;
}

function missingMessage(traitName: string, missing: TraitMethodSig[]): string {
  const names = missing.map((m) => m.name).join(", ");
  return `impl ${traitName} — missing required method${missing.length === 1 ? "" : "s"}: ${names}`;
}

// ----------------------------------------------------------------------------
// Completion
// ----------------------------------------------------------------------------

// Mix of declaration-level keywords (used in `.neoc`'s typed surface)
// and body-level Lua keywords (used inside method bodies and gaps).
const KEYWORDS = [
  // neoc declarations
  "struct", "impl", "trait", "match", "for", "Self", "function",
  "export", "import", "from", "as", "type",
  // Lua control flow + bindings (used inside method bodies)
  "local", "return", "if", "then", "else", "elseif", "end",
  "do", "while", "repeat", "until", "in", "break",
  // Lua literals + operators
  "nil", "true", "false", "and", "or", "not",
];
const DERIVE_NAMES = ["Clone", "Equals", "ToTable", "Display"];
const CONSTRAINT_MACROS = ["minLength", "maxLength", "minimum", "maximum", "pattern"];

interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  insertText?: string;
  /** LSP `InsertTextFormat`: 1 = plain text (default), 2 = snippet. */
  insertTextFormat?: 1 | 2;
  /** Markdown body. Zed shows this in the completion preview pane. */
  documentation?: { kind: "markdown"; value: string };
  /**
   * Sort priority. Lower sorts first. Used to surface trait-method
   * stubs above generic keyword/symbol noise.
   */
  sortText?: string;
}

function completionsAt(
  doc: DocState,
  pos: Position,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): { isIncomplete: false; items: CompletionItem[] } {
  const offset = positionToOffset(doc.text, pos);
  const before = doc.text.slice(0, offset);
  const items: CompletionItem[] = [];

  // Inside a `impl Trait for X { … }` body, between methods: suggest
  // one stub per trait method that hasn't been implemented yet. Only
  // method names are valid at this position in neoc, so we return
  // exclusively stubs and suppress the generic keyword/symbol list —
  // otherwise client-side fuzzy matchers tend to rank the stubs
  // beneath identifier noise from the rest of the workspace.
  // `self.<word>` / `Self.<word>` member access inside any impl method.
  const selfAccess = before.match(/\b(self|Self)\.(\w*)$/);
  if (selfAccess) {
    const enclosingImpl = findEnclosingImpl(doc, offset);
    if (enclosingImpl) {
      addStructFieldCompletions(enclosingImpl.name, doc, workspace, items);
      return { isIncomplete: false, items };
    }
  }

  // `<receiver>.<word>` — generic member access on any identifier
  // whose declared type we can resolve to a struct (function / method
  // parameter for now).
  const dotAccess = before.match(/\b([A-Za-z_][\w$]*)\.(\w*)$/);
  if (dotAccess) {
    const receiver = dotAccess[1]!;
    const receiverType = resolveLocalIdentifierType(doc, offset, receiver);
    if (receiverType) {
      addStructFieldCompletions(receiverType, doc, workspace, items);
      if (items.length > 0) return { isIncomplete: false, items };
    }
  }

  const implCtx = findImplBodyContext(doc, offset);
  if (implCtx) {
    addTraitMethodStubs(implCtx, doc, workspace, items);
    if (items.length > 0) return { isIncomplete: false, items };
  }

  // Inside `#[derive(…)]`: suggest derive names.
  if (/#\[derive\([^)]*$/.test(before)) {
    for (const n of DERIVE_NAMES) items.push({ label: n, kind: 7 /* Class */, detail: "derive macro" });
    return { isIncomplete: false, items };
  }

  // Inside `#[…]` (attribute slot): suggest field-constraint macros
  // and the `derive` invocation. Function-attribute macros aren't
  // bundled today; suggestions come from any user-loaded macros via
  // the live registry once that pipe is wired.
  if (/#\[[^\]\n]*$/.test(before)) {
    for (const n of CONSTRAINT_MACROS) items.push({ label: n, kind: 3 /* Function */, detail: "field constraint" });
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

interface ImplBodyContext {
  /** The impl declaration the cursor sits inside. */
  impl: M.ImplDecl;
  /** Names of methods already present in the impl block. */
  implemented: Set<string>;
}

// Return the impl declaration whose span contains `offset`, regardless
// of whether the cursor is inside a method body or at the block's
// top level. Used to resolve `self` / `Self` inside method bodies.
function findEnclosingImpl(doc: DocState, offset: number): M.ImplDecl | undefined {
  if (!doc.module) return undefined;
  for (const part of doc.module.parts) {
    if (part.kind !== "impl") continue;
    if (offset < part.span.start || offset > part.span.end) continue;
    return part;
  }
  return undefined;
}

// Resolve the declared type of an identifier in scope at `offset` by
// walking the parameter list of the enclosing function or impl
// method. Returns the unwrapped struct name (e.g. `Product`) when
// the parameter's annotation looks like a single struct identifier,
// otherwise undefined. Doesn't (yet) follow `let x: T = …` locals.
function resolveLocalIdentifierType(
  doc: DocState,
  offset: number,
  name: string,
): string | undefined {
  if (!doc.module) return undefined;
  const params = enclosingParamList(doc, offset);
  if (!params) return undefined;
  for (const p of parseParamList(params)) {
    if (p.name === name) {
      return extractStructName(p.type);
    }
  }
  return undefined;
}

function enclosingParamList(doc: DocState, offset: number): string | undefined {
  if (!doc.module) return undefined;
  for (const part of doc.module.parts) {
    if (part.kind === "function") {
      if (offset >= part.span.start && offset <= part.span.end) return part.params;
    } else if (part.kind === "impl") {
      if (offset < part.span.start || offset > part.span.end) continue;
      for (const m of part.methods) {
        if (offset >= m.span.start && offset <= m.span.end) return m.params;
      }
    }
  }
  return undefined;
}

// Tiny parameter parser — splits on top-level commas, then on the
// first `:` per entry. Matches the structure of `params` strings the
// parser hands us (verbatim, parens already stripped).
function parseParamList(raw: string): Array<{ name: string; type: string }> {
  const out: Array<{ name: string; type: string }> = [];
  let depth = 0;
  let last = 0;
  const parts: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { parts.push(raw.slice(last, i)); last = i + 1; }
  }
  if (last <= raw.length) parts.push(raw.slice(last));
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const colon = topLevelColonIndex(trimmed);
    if (colon < 0) continue;
    const name = trimmed.slice(0, colon).trim().replace(/[?].*$/, "");
    const rest = trimmed.slice(colon + 1).trim();
    const eq = rest.indexOf("=");
    const type = (eq < 0 ? rest : rest.slice(0, eq)).trim();
    out.push({ name, type });
  }
  return out;
}

function topLevelColonIndex(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

// Pull a single struct identifier out of a type annotation when the
// annotation looks like one. Returns undefined for unions, generics,
// arrays, primitives — anything we can't safely resolve to one
// struct's field list.
function extractStructName(typeText: string): string | undefined {
  const t = typeText.trim();
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(t)) return undefined;
  return t;
}

function addStructFieldCompletions(
  structName: string,
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
  items: CompletionItem[],
): void {
  const fields = resolveStructFields(structName, doc, workspace);
  if (!fields) return;
  let order = 0;
  for (const f of fields) {
    items.push(structFieldCompletion(f, structName, order++));
  }
}

function resolveStructFields(
  name: string,
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): StructFieldSig[] | undefined {
  if (doc.module) {
    for (const part of doc.module.parts) {
      if (part.kind === "struct" && part.name === name) {
        return collectStructFieldSigs(part, doc.text);
      }
    }
  }
  return workspace.get(`struct:${name}`)?.structFields;
}

function structFieldCompletion(
  f: StructFieldSig,
  structName: string,
  sortOrder: number,
): CompletionItem {
  const typeText = f.optional ? `${f.type} | undefined` : f.type;
  const detailParts = [`${f.name}: ${typeText}`, `field of ${structName}`];
  return {
    label: f.name,
    kind: 5 /* Field */,
    detail: detailParts.join("  ·  "),
    documentation: f.doc ? { kind: "markdown", value: f.doc } : undefined,
    sortText: `0_${String(sortOrder).padStart(3, "0")}_${f.name}`,
  };
}

// Cursor is inside an `impl Trait for X { … }` body, between methods
// (not inside a method body). Returns the impl + already-implemented
// method names, or undefined when the cursor isn't at that position.
function findImplBodyContext(doc: DocState, offset: number): ImplBodyContext | undefined {
  if (!doc.module) return undefined;
  for (const part of doc.module.parts) {
    if (part.kind !== "impl") continue;
    if (!part.traitName) continue;
    if (offset < part.span.start || offset > part.span.end) continue;
    // Must be past the opening `{`. Find it: the first `{` after the
    // declaration head in the source text.
    const head = doc.text.slice(part.span.start, part.span.end);
    const braceRel = head.indexOf("{");
    if (braceRel < 0) continue;
    if (offset <= part.span.start + braceRel) continue;
    // Must NOT be inside any method body.
    let insideMethod = false;
    for (const m of part.methods) {
      if (offset >= m.span.start && offset <= m.span.end) {
        insideMethod = true;
        break;
      }
    }
    if (insideMethod) continue;
    return {
      impl: part,
      implemented: new Set(part.methods.map((m) => m.name)),
    };
  }
  return undefined;
}

function addTraitMethodStubs(
  ctx: ImplBodyContext,
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
  items: CompletionItem[],
): void {
  const traitName = ctx.impl.traitName!;
  const methods = resolveTraitMethods(traitName, doc, workspace);
  if (!methods) return;
  const structName = ctx.impl.name;
  let order = 0;
  for (const m of methods) {
    if (ctx.implemented.has(m.name)) continue;
    items.push(traitMethodStub(m, structName, order++));
  }
}

function resolveTraitMethods(
  name: string,
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): TraitMethodSig[] | undefined {
  if (doc.module) {
    for (const part of doc.module.parts) {
      if (part.kind === "trait" && part.name === name) {
        return collectTraitMethodSigs(part, doc.text);
      }
    }
  }
  const sym = workspace.get(`trait:${name}`);
  return sym?.traitMethods;
}

function traitMethodStub(
  m: TraitMethodSig,
  structName: string,
  sortOrder: number,
): CompletionItem {
  const sig = m.signature.replace(/\bSelf\b/g, structName);
  const asyncPrefix = m.isAsync ? "async " : "";
  const insertText = `${asyncPrefix}${m.name}${sig} {\n  $0\n}`;
  const status = m.hasDefault ? "default — override" : "required";
  const docLines: string[] = [];
  docLines.push("```neoc");
  docLines.push(`${asyncPrefix}${m.name}${sig}`);
  docLines.push("```");
  docLines.push("");
  docLines.push(m.hasDefault
    ? "Trait method with a default body — override here to specialise."
    : "Required trait method — must be implemented.");
  if (m.doc) {
    docLines.push("");
    docLines.push(m.doc);
  }
  return {
    label: m.name,
    kind: 2 /* Method */,
    detail: `${m.name}${sig}  (${status})`,
    insertText,
    insertTextFormat: 2 /* Snippet */,
    documentation: { kind: "markdown", value: docLines.join("\n") },
    // Required methods sort first, defaults after, all before generic
    // completions.
    sortText: `0_${m.hasDefault ? "1" : "0"}_${String(sortOrder).padStart(3, "0")}_${m.name}`,
  };
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
  // Lua primitive types — keeping just the four neoc declarations
  // commonly annotate fields with. `void` / `any` / `unknown` / `never`
  // were TS-only and gone.
  for (const t of ["string", "number", "boolean", "table"]) {
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
  derive: "Derive macros append generated functions (e.g. `Foo.clone`, `Foo.equals`) to the struct's Lua table.",
  minLength: "Field constraint: `#data.<field> >= n`. Throws on shorter strings.",
  maxLength: "Field constraint: `#data.<field> <= n`. Throws on longer strings.",
  minimum: "Field constraint: `data.<field> >= n`. Throws on smaller numbers.",
  maximum: "Field constraint: `data.<field> <= n`. Throws on larger numbers.",
  pattern: "Field constraint: `string.match(data.<field>, pattern)` must be truthy.",
  Clone: "Derive: emits `function Foo.clone(self)` returning a deep copy with metatable preserved.",
  Equals: "Derive: emits `function Foo.equals(a, b)` returning structural equality across every declared field.",
  ToTable: "Derive: emits `function Foo.toTable(self)` returning a plain Lua table (no metatable, no methods).",
  Display: "Derive: emits `function Foo.display(self)` returning a human-readable `Foo { field=value, … }` string.",
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
  const sigBlock = "```neoc\n" + signature + "\n```";
  return doc ? `${sigBlock}\n\n${doc}` : sigBlock;
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

interface Location { uri: string; range: Range }

// ----------------------------------------------------------------------------
// Code actions
// ----------------------------------------------------------------------------

function codeActionsAt(
  doc: DocState,
  params: CodeActionParams,
  _workspace: ReadonlyMap<string, WorkspaceSymbol>,
): CodeAction[] {
  const out: CodeAction[] = [];
  for (const diag of params.context.diagnostics) {
    if (diag.code !== "neoc/missing-trait-methods") continue;
    const data = diag.data as MissingTraitMethodsData | undefined;
    if (!data) continue;
    out.push(buildImplementMissingAction(doc, params.textDocument.uri, diag, data));
  }
  return out;
}

function buildImplementMissingAction(
  doc: DocState,
  uri: string,
  diag: LspDiagnostic,
  data: MissingTraitMethodsData,
): CodeAction {
  const text = doc.text;
  // Locate the impl block's open `{` and matching close `}`.
  const head = text.slice(data.implSpan.start, data.implSpan.end);
  const openRel = head.indexOf("{");
  const openBrace = data.implSpan.start + openRel;
  let closeBrace = data.implSpan.end;
  while (closeBrace > openBrace && text[closeBrace - 1] !== "}") closeBrace--;
  closeBrace -= 1; // position of the `}` itself

  const indent = "  ";
  const stubs = data.missing
    .map((m) => renderMethodStub(m, data.implName, indent))
    .join("\n\n");

  // Inside content (between `{` and `}`, exclusive of both).
  const innerStart = openBrace + 1;
  const innerEnd = closeBrace;
  const inner = text.slice(innerStart, innerEnd);

  let replacement: string;
  let editStart: number;
  let editEnd: number;
  if (inner.trim() === "") {
    // Empty impl body — replace all interior whitespace with a single
    // canonical block so we never compound blank lines.
    replacement = `\n${stubs}\n`;
    editStart = innerStart;
    editEnd = innerEnd;
  } else {
    // Non-empty body — append stubs after the last existing method.
    // Anchor at the first non-whitespace char before `}` so we keep
    // existing trailing whitespace intact.
    let anchor = innerEnd;
    while (anchor > innerStart && /\s/.test(text[anchor - 1] ?? "")) anchor--;
    replacement = `\n\n${stubs}\n`;
    editStart = anchor;
    editEnd = innerEnd;
  }

  const range = {
    start: offsetToPosition(text, editStart),
    end: offsetToPosition(text, editEnd),
  };
  const edit: TextEdit = { range, newText: replacement };
  return {
    title: `Implement missing methods (${data.missing.length})`,
    kind: "quickfix",
    diagnostics: [diag],
    edit: { changes: { [uri]: [edit] } },
    isPreferred: true,
  };
}

function renderMethodStub(
  m: { name: string; signature: string; isAsync: boolean; hasDefault: boolean },
  implName: string,
  indent: string,
): string {
  const sig = m.signature.replace(/\bSelf\b/g, implName);
  const asyncPrefix = m.isAsync ? "async " : "";
  const todo = m.hasDefault
    ? `${indent}${indent}// TODO override default for ${m.name}`
    : `${indent}${indent}throw new Error("${m.name} not implemented");`;
  return `${indent}${asyncPrefix}${m.name}${sig} {\n${todo}\n${indent}}`;
}

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
// Document symbols
// ----------------------------------------------------------------------------

/**
 * Build the outline tree for a parsed neoc document. One top-level
 * entry per `ModulePart` (structs, traits, impls, functions); opaque
 * parts are skipped. Fields nest under structs; methods nest under
 * traits and impls.
 *
 * Pure: same input → same output. Returns `[]` when the document
 * failed to parse.
 */
export function documentSymbolsFor(doc: DocState): DocumentSymbol[] {
  if (!doc.module) return [];
  const out: DocumentSymbol[] = [];
  for (const part of doc.module.parts) {
    if (part.kind === "opaque") continue;
    const sym = topLevelSymbol(part, doc.text);
    if (sym) out.push(sym);
  }
  return out;
}

function topLevelSymbol(part: M.ModulePart, text: string): DocumentSymbol | undefined {
  if (part.kind === "opaque") return undefined;
  const range = offsetsToRange(text, part.span.start, part.span.end);
  const selectionRange = selectionRangeForName(text, part.span, part.name);
  if (part.kind === "struct") {
    return {
      name: part.name,
      kind: SymbolKind.Struct,
      range,
      selectionRange,
      children: part.fields.map((f) => fieldSymbol(f, text)),
    };
  }
  if (part.kind === "trait") {
    return {
      name: part.name,
      kind: SymbolKind.Interface,
      range,
      selectionRange,
      children: part.methods.map((m) => traitMethodSymbol(m, text)),
    };
  }
  if (part.kind === "impl") {
    const detail = part.traitName ? `impl ${part.traitName}` : "impl";
    return {
      name: part.name,
      detail,
      kind: SymbolKind.Class,
      range,
      selectionRange,
      children: part.methods.map((m) => implMethodSymbol(m, text)),
    };
  }
  if (part.kind === "function") {
    return {
      name: part.name,
      detail: part.signature.trim() || undefined,
      kind: SymbolKind.Function,
      range,
      selectionRange,
    };
  }
  return undefined;
}

function fieldSymbol(f: M.StructField, text: string): DocumentSymbol {
  const range = offsetsToRange(text, f.span.start, f.span.end);
  const selectionRange = selectionRangeForName(text, f.span, f.name);
  const detail = f.optional ? `${f.type} | undefined` : f.type;
  return {
    name: f.name,
    detail,
    kind: SymbolKind.Field,
    range,
    selectionRange,
  };
}

function traitMethodSymbol(m: M.TraitMethod, text: string): DocumentSymbol {
  const range = offsetsToRange(text, m.span.start, m.span.end);
  const selectionRange = selectionRangeForName(text, m.span, m.name);
  return {
    name: m.name,
    detail: m.signature.trim() || undefined,
    kind: SymbolKind.Method,
    range,
    selectionRange,
  };
}

function implMethodSymbol(m: M.ImplMethod, text: string): DocumentSymbol {
  const range = offsetsToRange(text, m.span.start, m.span.end);
  const selectionRange = selectionRangeForName(text, m.span, m.name);
  return {
    name: m.name,
    detail: m.signature.trim() || undefined,
    kind: SymbolKind.Method,
    range,
    selectionRange,
  };
}

// Locate the declaration's name token inside its span so the editor
// can place the cursor on the identifier rather than the keyword.
// Falls back to the declaration's full range when the name can't be
// found verbatim — defensive for synthetic or oddly-shaped spans.
function selectionRangeForName(text: string, span: M.Span, name: string): Range {
  const slice = text.slice(span.start, span.end);
  const rel = slice.indexOf(name);
  if (rel < 0) return offsetsToRange(text, span.start, span.end);
  const start = span.start + rel;
  return offsetsToRange(text, start, start + name.length);
}

// ----------------------------------------------------------------------------
// Rename
// ----------------------------------------------------------------------------

/**
 * Validates the rename position. Returns the range of the identifier
 * under the cursor along with a placeholder (the current name) when
 * the cursor sits on a renameable symbol — a declaration or reference
 * to a struct, trait, function, or impl visible in the document or
 * workspace. Returns `null` for keywords, primitives, or whitespace.
 */
export function prepareRenameAt(
  doc: DocState,
  pos: Position,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): PrepareRenameResult | null {
  const word = wordAt(doc.text, pos);
  if (!word) return null;
  if (!isRenameableSymbol(word.text, doc, workspace)) return null;
  return { range: word.range, placeholder: word.text };
}

/**
 * Builds a `WorkspaceEdit` that renames every occurrence of the symbol
 * under the cursor to `newName`. Scans the document plus every `.neoc`
 * file under every workspace root with a word-boundary regex, grouping
 * edits by URI.
 *
 * Returns `null` when the cursor isn't on a renameable identifier.
 *
 * @remarks
 * The scanner is lexical — it skips occurrences inside string literals
 * (single, double, and backtick-quoted) and line comments (`//` and
 * `///`). Block comments (`/* … *​/`) are also skipped. It does **not**
 * attempt semantic disambiguation: a struct named `Foo` and a function
 * also named `Foo` would be renamed together. The caller is expected
 * to surface this caveat in the rename confirmation dialog.
 */
export async function renameSymbol(
  doc: DocState,
  pos: Position,
  newName: string,
  workspaceRoots: readonly string[],
  docUri: string,
): Promise<WorkspaceEdit | null> {
  const word = wordAt(doc.text, pos);
  if (!word) return null;
  if (!isValidIdentifier(newName)) return null;
  if (KEYWORDS.includes(word.text)) return null;
  if (PRIMITIVE_TYPES.includes(word.text)) return null;
  // No-op rename — return an empty workspace edit so the editor
  // doesn't churn the file with identical text.
  if (newName === word.text) return { changes: {} };
  const oldName = word.text;

  const changes: Record<string, TextEdit[]> = {};
  const seen = new Set<string>();

  // Always scan the open document first so unsaved edits get renamed
  // even when the workspace copy on disk is stale.
  const docEdits = collectOccurrenceEdits(doc.text, oldName, newName);
  if (docEdits.length > 0) changes[docUri] = docEdits;
  seen.add(docUri);

  for (const root of workspaceRoots) {
    const glob = new Bun.Glob("**/*.neoc");
    for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
      const abs = `${root}/${rel}`;
      const uri = pathToFileURL(abs).href;
      if (seen.has(uri)) continue;
      seen.add(uri);
      let text: string;
      try {
        text = readFileSync(abs, "utf-8");
      } catch {
        continue;
      }
      const edits = collectOccurrenceEdits(text, oldName, newName);
      if (edits.length > 0) changes[uri] = edits;
    }
  }

  return { changes };
}

// Treat any identifier that resolves to a workspace symbol or a local
// declaration as renameable. Falls back to "looks like an identifier"
// so references to symbols declared in unparsed files still qualify.
function isRenameableSymbol(
  name: string,
  doc: DocState,
  workspace: ReadonlyMap<string, WorkspaceSymbol>,
): boolean {
  if (!isValidIdentifier(name)) return false;
  if (KEYWORDS.includes(name)) return false;
  if (PRIMITIVE_TYPES.includes(name)) return false;
  if (doc.module) {
    for (const p of doc.module.parts) {
      if (p.kind === "opaque") continue;
      if (p.name === name) return true;
      if (p.kind === "struct") {
        for (const f of p.fields) if (f.name === name) return true;
      }
      if (p.kind === "trait") {
        for (const m of p.methods) if (m.name === name) return true;
      }
      if (p.kind === "impl") {
        for (const m of p.methods) if (m.name === name) return true;
      }
    }
  }
  for (const sym of workspace.values()) {
    if (sym.name === name) return true;
  }
  // Be permissive: any capitalised or snake-case identifier the user
  // points at deserves a rename attempt — the workspace scan handles
  // verification by simply finding (or not finding) other occurrences.
  return true;
}

function isValidIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

const PRIMITIVE_TYPES = ["string", "number", "boolean", "table", "nil"];

/**
 * Scan `text` for word-boundary occurrences of `oldName`, returning a
 * `TextEdit` that replaces each one with `newName`. Skips ranges
 * inside string literals (`"…"`, `'…'`, `` `…` ``), line comments
 * (`//…`), and block comments (`/* … *​/`).
 */
function collectOccurrenceEdits(text: string, oldName: string, newName: string): TextEdit[] {
  const edits: TextEdit[] = [];
  const skip = buildSkipMask(text);
  const pattern = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index;
    const end = start + oldName.length;
    if (skip[start]) continue;
    edits.push({
      range: offsetsToRange(text, start, end),
      newText: newName,
    });
  }
  return edits;
}

// Build a per-character boolean mask: `true` where the character sits
// inside a comment or string literal and should be skipped by the
// rename scanner. One pass over the source.
function buildSkipMask(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      // Line comment — skip to end of line.
      while (i < text.length && text[i] !== "\n") { mask[i] = 1; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      // Block comment — skip to matching */.
      mask[i] = 1; mask[i + 1] = 1; i += 2;
      while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          mask[i] = 1; mask[i + 1] = 1; i += 2;
          break;
        }
        mask[i] = 1; i++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      mask[i] = 1; i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < text.length) { mask[i] = 1; mask[i + 1] = 1; i += 2; continue; }
        if (text[i] === "\n" && quote !== "`") break;
        mask[i] = 1; i++;
      }
      if (i < text.length) { mask[i] = 1; i++; }
      continue;
    }
    i++;
  }
  return mask;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
          `neoc-lsp: failed to handle message: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    }
  }
}
