import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "./parser/index.ts";
import { findReferences, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

function makeWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "neoc-refs-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    const dir = abs.slice(0, abs.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(abs, body, "utf-8");
  }
  return root;
}

function offsetOf(source: string, snippet: string, occurrence = 0): { line: number; character: number } {
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    const at = source.indexOf(snippet, from);
    if (at < 0) throw new Error(`snippet "${snippet}" #${occurrence} not in source`);
    if (i === occurrence) {
      let line = 0;
      let lastNl = -1;
      for (let j = 0; j < at; j++) {
        if (source.charCodeAt(j) === 10) { line++; lastNl = j; }
      }
      return { line, character: at - lastNl - 1 };
    }
    from = at + snippet.length;
  }
  throw new Error("unreachable");
}

test("returns an empty list when the cursor isn't on an identifier", async () => {
  const source = "struct Widget { id: string }\n";
  const d = await doc(source);
  // Cursor on the `{` character — not an identifier.
  const braceCol = source.indexOf("{");
  const refs = await findReferences(d, { line: 0, character: braceCol }, "file:///x.neoc", []);
  expect(refs).toEqual([]);
});

test("returns the declaration and every same-file use of a struct name", async () => {
  const source = `struct Product { id: string }

function tag(p: Product): Product {
  return p
}
`;
  const d = await doc(source);
  const pos = offsetOf(source, "Product", 0);
  const refs = await findReferences(d, pos, "file:///app.neoc", []);
  expect(refs).toHaveLength(3);
  for (const r of refs) expect(r.uri).toBe("file:///app.neoc");
  const lines = refs.map((r) => r.range.start.line).sort((a, b) => a - b);
  expect(lines).toEqual([0, 2, 2]);
});

test("word-boundary scan ignores names embedded inside larger identifiers", async () => {
  const source = `struct Foo { id: string }

function take(x: Foo): Foo { return x }
function other(): string {
  let Foobar = "x"
  let MyFoo = "y"
  return Foobar
}
`;
  const d = await doc(source);
  const pos = offsetOf(source, "Foo", 0);
  const refs = await findReferences(d, pos, "file:///a.neoc", []);
  // Declaration + the two `Foo` references in `take`'s signature.
  expect(refs).toHaveLength(3);
});

test("skips occurrences inside line comments, doc comments, and string literals", async () => {
  const source = `// mentions Bar in a comment
/// also mentions Bar here
struct Bar { id: string }
function noise(): string {
  return "Bar is just a string"
}
`;
  const d = await doc(source);
  const pos = offsetOf(source, "Bar", 2); // first identifier occurrence is the struct decl
  const refs = await findReferences(d, pos, "file:///a.neoc", []);
  expect(refs).toHaveLength(1);
  expect(refs[0]!.range.start.line).toBe(2);
});

test("finds cross-file references across the workspace", async () => {
  const root = makeWorkspace({
    "entities/Product.neoc": `struct Product { id: string }\n`,
    "controllers/list.neoc": `function list(p: Product): Product { return p }\n`,
    "unrelated.neoc": `struct Other { name: string }\n`,
  });
  try {
    const localSource = `function tag(p: Product): Product { return p }\n`;
    const d = await doc(localSource);
    const openUri = pathToFileURL(join(root, "controllers/list.neoc")).href;
    const pos = offsetOf(localSource, "Product", 0);
    const refs = await findReferences(d, pos, openUri, [root]);
    const uris = new Set(refs.map((r) => r.uri));
    expect(uris.has(openUri)).toBe(true);
    expect(uris.has(pathToFileURL(join(root, "entities/Product.neoc")).href)).toBe(true);
    // Open document contributes 2 hits (its in-memory text); the
    // matching disk URI is skipped, but `entities/Product.neoc`
    // contributes its declaration. Total = 3.
    expect(refs).toHaveLength(3);
    // The unrelated file must not appear.
    expect(uris.has(pathToFileURL(join(root, "unrelated.neoc")).href)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not double-count the open document when its uri is also on disk", async () => {
  const root = makeWorkspace({
    "Foo.neoc": `struct Foo { id: string }\nfunction take(f: Foo): Foo { return f }\n`,
  });
  try {
    const abs = join(root, "Foo.neoc");
    const uri = pathToFileURL(abs).href;
    const source = `struct Foo { id: string }\nfunction take(f: Foo): Foo { return f }\n`;
    const d = await doc(source);
    const pos = offsetOf(source, "Foo", 0);
    const refs = await findReferences(d, pos, uri, [root]);
    // Should be 3 (one decl + two uses) - not 6.
    expect(refs).toHaveLength(3);
    for (const r of refs) expect(r.uri).toBe(uri);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
