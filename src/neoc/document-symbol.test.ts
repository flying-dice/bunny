import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { documentSymbolsFor, SymbolKind, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

test("returns an empty outline when the document failed to parse", () => {
  expect(documentSymbolsFor({ text: "" })).toEqual([]);
});

test("structs surface as Struct symbols with one Field child per declared field", async () => {
  const d = await doc(`
    struct Product {
      id: string,
      name: string,
      stock?: number,
    }
  `);
  const symbols = documentSymbolsFor(d);
  expect(symbols).toHaveLength(1);
  const product = symbols[0]!;
  expect(product.name).toBe("Product");
  expect(product.kind).toBe(SymbolKind.Struct);
  expect(product.children?.map((c) => c.name)).toEqual(["id", "name", "stock"]);
  for (const child of product.children ?? []) {
    expect(child.kind).toBe(SymbolKind.Field);
  }
  const stock = product.children!.find((c) => c.name === "stock")!;
  expect(stock.detail).toContain("undefined");
});

test("trait declarations surface as Interface with Method children", async () => {
  const d = await doc(`
    trait Display {
      display(self: Self): string;
      label(self: Self): string {
        return "x"
      }
    }
  `);
  const symbols = documentSymbolsFor(d);
  expect(symbols).toHaveLength(1);
  const display = symbols[0]!;
  expect(display.name).toBe("Display");
  expect(display.kind).toBe(SymbolKind.Interface);
  expect(display.children?.map((c) => c.name)).toEqual(["display", "label"]);
  for (const child of display.children ?? []) {
    expect(child.kind).toBe(SymbolKind.Method);
  }
});

test("inherent impl surfaces as Class with `impl` detail", async () => {
  const d = await doc(`
    struct Counter { n: number }
    impl Counter {
      increment(self: Counter): void {
        self.n = self.n + 1
      }
    }
  `);
  const symbols = documentSymbolsFor(d);
  const impl = symbols.find((s) => s.kind === SymbolKind.Class)!;
  expect(impl.name).toBe("Counter");
  expect(impl.detail).toBe("impl");
  expect(impl.children?.map((c) => c.name)).toEqual(["increment"]);
  expect(impl.children?.[0]!.kind).toBe(SymbolKind.Method);
});

test("trait impl surfaces with `impl <Trait>` detail", async () => {
  const d = await doc(`
    trait Display {
      display(self: Self): string;
    }
    struct Point { x: number, y: number }
    impl Display for Point {
      display(self: Point): string {
        return "p"
      }
    }
  `);
  const symbols = documentSymbolsFor(d);
  const traitImpl = symbols.find(
    (s) => s.kind === SymbolKind.Class && s.detail === "impl Display",
  );
  expect(traitImpl).toBeDefined();
  expect(traitImpl!.name).toBe("Point");
  expect(traitImpl!.children?.map((c) => c.name)).toEqual(["display"]);
});

test("top-level functions surface as Function symbols with their signature as detail", async () => {
  const d = await doc(`
    function greet(name: string): string {
      return "hi"
    }
  `);
  const symbols = documentSymbolsFor(d);
  expect(symbols).toHaveLength(1);
  const greet = symbols[0]!;
  expect(greet.name).toBe("greet");
  expect(greet.kind).toBe(SymbolKind.Function);
  expect(greet.detail).toContain("name: string");
  expect(greet.children).toBeUndefined();
});

test("selectionRange targets the declaration's name, not the whole span", async () => {
  const source = `struct Widget { id: string }`;
  const d = await doc(source);
  const [widget] = documentSymbolsFor(d);
  const nameStart = source.indexOf("Widget");
  expect(widget!.selectionRange.start.character).toBe(nameStart);
  expect(widget!.selectionRange.end.character).toBe(nameStart + "Widget".length);
  expect(widget!.range.start.character).toBeLessThanOrEqual(widget!.selectionRange.start.character);
});

test("multiple top-level parts preserve source order", async () => {
  const d = await doc(`
    struct A { x: number }
    function go(): void { return }
    trait T { ping(self: Self): void; }
    impl A { kick(self: A): void { } }
  `);
  const names = documentSymbolsFor(d).map((s) => s.name);
  expect(names).toEqual(["A", "go", "T", "A"]);
});
