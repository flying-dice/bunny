/**
 * Tests for `inferenceDiagnostics` — the third diagnostic source the
 * LSP layers on top of the parser/emitter pipeline.
 *
 * The helper walks every function/impl-method/trait-method-with-body in
 * the document, runs `inferBody`, and converts each `TypeDiagnostic`
 * the walker collected into an LSP `Warning` carrying
 * `code = "neoc/inference"`.
 */
import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { inferenceDiagnostics, type DocState } from "./lsp.ts";

interface WorkspaceSymbolShape {
  name: string;
  kind: "struct" | "trait" | "function" | "impl" | "extern_function";
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  detail: string;
}

async function buildDoc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

const emptyWorkspace = new Map<string, WorkspaceSymbolShape>();

function workspaceWith(entries: WorkspaceSymbolShape[]): Map<string, WorkspaceSymbolShape> {
  const out = new Map<string, WorkspaceSymbolShape>();
  for (const e of entries) out.set(`${e.kind}:${e.name}`, e);
  return out;
}

// ---------------------------------------------------------------------------
// Unbound identifier → Warning with the right code + severity + range
// ---------------------------------------------------------------------------

test("a body referencing an undeclared identifier surfaces a Warning", async () => {
  const source = `pub fn f() -> number { return ghost }`;
  const doc = await buildDoc(source);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diags = inferenceDiagnostics(doc, emptyWorkspace as any);
  expect(diags.length).toBe(1);
  const diag = diags[0]!;
  expect(diag.severity).toBe(2);
  expect(diag.source).toBe("neoc");
  expect(diag.code).toBe("neoc/inference");
  expect(diag.message).toBe("unbound: ghost");

  // Range covers the `ghost` token only — derived from the AST node
  // offset, not the whole return statement.
  const start = source.indexOf("ghost");
  expect(diag.range.start.line).toBe(0);
  expect(diag.range.start.character).toBe(start);
  expect(diag.range.end.character).toBe(start + "ghost".length);
});

// ---------------------------------------------------------------------------
// Clean body produces nothing
// ---------------------------------------------------------------------------

test("a clean function body produces no inference diagnostics", async () => {
  const doc = await buildDoc(`pub fn f() -> number { let x = 42; return x }`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(inferenceDiagnostics(doc, emptyWorkspace as any)).toEqual([]);
});

// ---------------------------------------------------------------------------
// `ext fn` in the same module silences the unbound check
// ---------------------------------------------------------------------------

test("an in-scope ext fn satisfies the reference", async () => {
  const doc = await buildDoc(`
    ext fn parseInt(s: string) -> number;
    pub fn f() -> number {
      let n = parseInt("42");
      return n
    }
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(inferenceDiagnostics(doc, emptyWorkspace as any)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Function parameters are in scope
// ---------------------------------------------------------------------------

test("function parameters are in scope and don't read as unbound", async () => {
  const doc = await buildDoc(`pub fn greet(name: string) -> string { return name }`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(inferenceDiagnostics(doc, emptyWorkspace as any)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Cross-file: a workspace symbol from another .neoc file satisfies the ref
// ---------------------------------------------------------------------------

test("cross-file: a workspace symbol satisfies the reference", async () => {
  const doc = await buildDoc(`
    pub fn f() -> string {
      return greet("world")
    }
  `);
  const workspace = workspaceWith([
    {
      name: "greet",
      kind: "function",
      uri: "file:///other.neoc",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      detail: "fn greet(name: string) -> string",
    },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(inferenceDiagnostics(doc, workspace as any)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Impl method bodies are walked too — and `self` is in scope inside them.
// ---------------------------------------------------------------------------

test("impl method bodies are walked; unbound references inside surface", async () => {
  const doc = await buildDoc(`
    struct Product { id: string }
    impl Product {
      stray(self: Self) -> string {
        return ghost
      }
    }
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diags = inferenceDiagnostics(doc, emptyWorkspace as any);
  const messages = diags.map((d) => d.message);
  expect(messages).toContain("unbound: ghost");
  // `self` is seeded into the per-method scope before the walker runs.
  expect(messages).not.toContain("unbound: self");
});
