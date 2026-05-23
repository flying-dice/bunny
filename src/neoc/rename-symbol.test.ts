import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "./parser/index.ts";
import { prepareRenameAt, renameSymbol, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

test("renameSymbol rewrites every occurrence of a struct in a single document", async () => {
  const source = `
    struct Product {
      id: string,
      name: string,
    }

    impl Product {
      label(self: Product): string {
        return self.name
      }
    }

    function makeProduct(p: Product): Product {
      return p
    }
  `;
  const d = await doc(source);
  // Cursor on the struct's name (line index 1, character "Product" start).
  const namePos = positionOf(source, "struct Product", "Product");
  const uri = "file:///work/entities.neoc";
  const edit = await renameSymbol(d, namePos, "Item", [], uri);
  expect(edit).not.toBeNull();
  const edits = edit!.changes[uri]!;
  // Five occurrences: struct decl, impl head, self param type,
  // makeProduct param type, makeProduct return type. `makeProduct`
  // itself is a word boundary away and is not matched.
  expect(edits.length).toBe(5);
  for (const e of edits) {
    expect(e.newText).toBe("Item");
  }
});

test("renameSymbol returns null when the cursor isn't on an identifier", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  // Cursor inside the `struct` keyword — not a renameable symbol.
  const pos = { line: 0, character: 2 };
  const edit = await renameSymbol(d, pos, "X", [], "file:///x.neoc");
  expect(edit).toBeNull();
});

test("renameSymbol rejects an invalid new name", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  const pos = positionOf(source, "struct Widget", "Widget");
  const edit = await renameSymbol(d, pos, "9bad name", [], "file:///x.neoc");
  expect(edit).toBeNull();
});

test("renameSymbol returns an empty workspace edit when the new name matches the old", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  const pos = positionOf(source, "struct Widget", "Widget");
  const edit = await renameSymbol(d, pos, "Widget", [], "file:///x.neoc");
  expect(edit).toEqual({ changes: {} });
});

test("renameSymbol skips occurrences inside string literals and comments", async () => {
  const source = `
    struct Widget { id: string }
    // Widget mentioned in a comment
    function describe(): string {
      return "Widget is a name in a string"
    }
    function use(w: Widget): Widget {
      return w
    }
  `;
  const d = await doc(source);
  const pos = positionOf(source, "struct Widget", "Widget");
  const uri = "file:///x.neoc";
  const edit = await renameSymbol(d, pos, "Item", [], uri);
  const edits = edit!.changes[uri] ?? [];
  // Three real occurrences: struct decl + param type + return type.
  expect(edits.length).toBe(3);
});

test("renameSymbol spans every .neoc file under the workspace root", async () => {
  const root = mkdtempSync(join(tmpdir(), "neoc-rename-"));
  try {
    mkdirSync(join(root, "entities"));
    mkdirSync(join(root, "controllers"));
    const entityPath = join(root, "entities", "Product.neoc");
    const ctrlPath = join(root, "controllers", "shop.neoc");
    writeFileSync(entityPath, "struct Product { id: string }\n", "utf-8");
    writeFileSync(
      ctrlPath,
      "function buy(p: Product): Product { return p }\n",
      "utf-8",
    );
    const openText = "struct Product { id: string }\n";
    const d = await doc(openText);
    const pos = positionOf(openText, "struct Product", "Product");
    const openUri = pathToFileURL(entityPath).href;
    const edit = await renameSymbol(d, pos, "Item", [root], openUri);
    expect(edit).not.toBeNull();
    const ctrlUri = pathToFileURL(ctrlPath).href;
    expect(edit!.changes[openUri]).toBeDefined();
    expect(edit!.changes[ctrlUri]).toBeDefined();
    expect(edit!.changes[ctrlUri]!.length).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepareRenameAt returns the identifier range and placeholder", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  const pos = positionOf(source, "struct Widget", "Widget");
  const result = prepareRenameAt(d, pos, new Map());
  expect(result).not.toBeNull();
  expect(result!.placeholder).toBe("Widget");
  const start = source.indexOf("Widget");
  expect(result!.range.start.character).toBe(start);
  expect(result!.range.end.character).toBe(start + "Widget".length);
});

test("prepareRenameAt returns null on whitespace", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  const pos = { line: 0, character: 6 }; // the space after `struct`
  expect(prepareRenameAt(d, pos, new Map())).toBeNull();
});

test("prepareRenameAt returns null on a language keyword", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  // Cursor inside the `struct` keyword.
  const pos = { line: 0, character: 2 };
  expect(prepareRenameAt(d, pos, new Map())).toBeNull();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Find the position of `needle` inside the first occurrence of
// `anchor` in `text`. Returns an LSP `Position` pointing at the start
// of `needle`.
function positionOf(text: string, anchor: string, needle: string): { line: number; character: number } {
  const anchorStart = text.indexOf(anchor);
  if (anchorStart < 0) throw new Error(`anchor not found: ${anchor}`);
  const offset = anchorStart + anchor.indexOf(needle);
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
  }
  return { line, character: offset - lineStart };
}
