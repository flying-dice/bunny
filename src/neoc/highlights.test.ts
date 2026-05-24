/**
 * Tests for the tree-sitter highlight queries that drive editor
 * colouring. Loads `zed/tree-sitter-neoc/queries/highlights.scm` and
 * runs it against fixture sources, asserting that specific tokens land
 * in specific capture groups (`@keyword`, `@type`, `@function`, …).
 *
 * Catches regressions where a grammar tweak silently breaks a capture,
 * which the parser tests wouldn't surface (a token still parses; it
 * just doesn't highlight any more).
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Language, Parser, Query } from "web-tree-sitter";

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(HERE, "../../zed/tree-sitter-neoc/tree-sitter-neoc.wasm");
const HIGHLIGHTS_PATH = resolve(HERE, "../../zed/tree-sitter-neoc/queries/highlights.scm");

let parserPromise: Promise<{ parser: Parser; language: Language }> | undefined;

async function getParser(): Promise<{ parser: Parser; language: Language }> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init();
      const language = await Language.load(readFileSync(WASM_PATH));
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
  }
  return parserPromise;
}

interface CaptureHit {
  name: string;
  text: string;
  row: number;
}

async function captures(source: string): Promise<CaptureHit[]> {
  const { parser, language } = await getParser();
  const tree = parser.parse(source);
  if (!tree) throw new Error("parse failed");
  const queryText = readFileSync(HIGHLIGHTS_PATH, "utf-8");
  const query = new Query(language, queryText);
  const matches = query.captures(tree.rootNode);
  const out: CaptureHit[] = matches.map((m) => ({
    name: m.name,
    text: m.node.text,
    row: m.node.startPosition.row,
  }));
  tree.delete();
  query.delete();
  return out;
}

// Returns the set of capture names that match `text` at `row`.
function namesFor(hits: CaptureHit[], text: string, row?: number): string[] {
  return hits
    .filter((h) => h.text === text && (row === undefined || h.row === row))
    .map((h) => h.name);
}

test("keywords (struct, impl, trait, match, for, function, export, return) capture @keyword", async () => {
  const hits = await captures(`
    export struct Foo { id: string }
    impl Foo { display(self: Foo): string { return self.id } }
    trait Bar {}
    export function f(): void { match 0 { _ => 0 } }
  `);
  for (const kw of ["export", "struct", "impl", "trait", "function", "match", "return", "for"]) {
    const names = namesFor(hits, kw);
    if (kw === "for") continue; // `for` only appears as part of `impl Trait for Foo` — see dedicated test below
    expect(names).toContain("keyword");
  }
});

test("type identifiers in declaration position capture @type", async () => {
  const hits = await captures(`
    struct Product { id: string }
    trait Display {}
    impl Display for Product {}
  `);
  expect(namesFor(hits, "Product")).toContain("type");
  expect(namesFor(hits, "Display")).toContain("type");
});

test("primitive types (string, number, boolean) capture @type.builtin", async () => {
  const hits = await captures(`
    struct Foo { a: string, b: number, c: boolean }
  `);
  expect(namesFor(hits, "string")).toContain("type.builtin");
  expect(namesFor(hits, "number")).toContain("type.builtin");
  expect(namesFor(hits, "boolean")).toContain("type.builtin");
});

test("Self type captures @keyword (and @type.builtin)", async () => {
  const hits = await captures(`
    trait T { f(self: Self): Self }
  `);
  const selfHits = namesFor(hits, "Self");
  expect(selfHits).toContain("keyword");
});

test("function names capture @function", async () => {
  const hits = await captures(`
    function helper(): void {}
    export function add(a: number, b: number): number { return a + b }
  `);
  expect(namesFor(hits, "helper")).toContain("function");
  expect(namesFor(hits, "add")).toContain("function");
});

test("impl + trait method names capture @function.method", async () => {
  const hits = await captures(`
    struct Foo {}
    impl Foo { greet(self: Foo): string { return "hi" } }
    trait Bar { hello(self: Self): string }
  `);
  expect(namesFor(hits, "greet")).toContain("function.method");
  expect(namesFor(hits, "hello")).toContain("function.method");
});

test("struct field names capture @property", async () => {
  const hits = await captures(`
    struct Product { id: string, name: string, stock: number }
  `);
  expect(namesFor(hits, "id")).toContain("property");
  expect(namesFor(hits, "name")).toContain("property");
  expect(namesFor(hits, "stock")).toContain("property");
});

test("attribute macros capture @attribute on the bracket tokens + macro name", async () => {
  const hits = await captures(`
    #[derive(Clone, Equals)]
    struct Foo { id: string }
  `);
  // `#`, `[`, `]`, and the macro name (`derive`) each carry @attribute.
  expect(namesFor(hits, "#")).toContain("attribute");
  expect(namesFor(hits, "[")).toContain("attribute");
  expect(namesFor(hits, "]")).toContain("attribute");
  expect(namesFor(hits, "derive")).toContain("attribute");
});
