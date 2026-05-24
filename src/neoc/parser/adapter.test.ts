import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "./adapter.ts";
import type * as M from "../ast/index.ts";

// Tests for the tree-sitter → typed AST adapter. Every test asserts on
// `Module.parts` shape — the contract every downstream consumer
// (codegen, LSP, lowerings) reads. Body bodies are opaque-text so we
// don't dig into expressions; only top-level declarations are pinned.

const parts = async (src: string): Promise<M.ModulePart[]> => {
  const { module, diagnostics } = await parseViaTreeSitter(src);
  // Parser diagnostics are non-fatal but a clean source should produce
  // none. The tests below all use clean sources.
  expect(diagnostics).toEqual([]);
  return module.parts;
};

const notOpaque = (p: M.ModulePart): boolean => p.kind !== "opaque";

test("struct: parses name, fields, types, optional flag", async () => {
  const ps = (await parts(`
    struct Product {
      id: string,
      name: string,
      stock?: number,
    }
  `)).filter(notOpaque);
  expect(ps).toHaveLength(1);
  const [p] = ps as [M.StructDecl];
  expect(p.kind).toBe("struct");
  expect(p.name).toBe("Product");
  expect(p.fields.map((f) => f.name)).toEqual(["id", "name", "stock"]);
  expect(p.fields.map((f) => f.type)).toEqual(["string", "string", "number"]);
  expect(p.fields.map((f) => f.optional)).toEqual([false, false, true]);
});

test("struct: exported flag", async () => {
  const ps = (await parts(`export struct Foo { id: string }`)).filter(notOpaque);
  expect((ps[0] as M.StructDecl).exported).toBe(true);
  const ps2 = (await parts(`struct Foo { id: string }`)).filter(notOpaque);
  expect((ps2[0] as M.StructDecl).exported).toBe(false);
});

test("struct: attributes attach to the declaration", async () => {
  const ps = (await parts(`
    #[derive(Clone, Equals)]
    struct Foo { id: string }
  `)).filter(notOpaque);
  const s = ps[0] as M.StructDecl;
  expect(s.attrs).toHaveLength(1);
  expect(s.attrs[0]!.name).toBe("derive");
  expect(s.attrs[0]!.argList).toEqual(["Clone", "Equals"]);
});

test("struct: field-level attributes attach to each field", async () => {
  const ps = (await parts(`
    struct User {
      #[minLength(1)]
      #[maxLength(64)]
      name: string,
    }
  `)).filter(notOpaque);
  const s = ps[0] as M.StructDecl;
  const f = s.fields[0]!;
  expect(f.attrs.map((a) => a.name)).toEqual(["minLength", "maxLength"]);
  expect(f.attrs[0]!.argList).toEqual(["1"]);
  expect(f.attrs[1]!.argList).toEqual(["64"]);
});

test("tuple-struct: shorthand desugars to a single `value` field", async () => {
  const ps = (await parts(`struct ProductId(string)`)).filter(notOpaque);
  const s = ps[0] as M.StructDecl;
  expect(s.name).toBe("ProductId");
  expect(s.fields.map((f) => f.name)).toEqual(["value"]);
  expect(s.fields.map((f) => f.type)).toEqual(["string"]);
});

test("impl: inherent block — no traitName, methods listed", async () => {
  const ps = (await parts(`
    struct Counter { n: number }
    impl Counter {
      bump(self: Counter): void { }
    }
  `)).filter(notOpaque);
  const impl = ps.find((p) => p.kind === "impl") as M.ImplDecl;
  expect(impl.traitName).toBeUndefined();
  expect(impl.name).toBe("Counter");
  expect(impl.methods.map((m) => m.name)).toEqual(["bump"]);
});

test("impl: trait impl — traitName + target captured", async () => {
  const ps = (await parts(`
    trait Display { display(self: Self): string }
    struct Foo { id: string }
    impl Display for Foo {
      display(self: Foo): string { return self.id }
    }
  `)).filter(notOpaque);
  const impl = ps.find((p) => p.kind === "impl") as M.ImplDecl;
  expect(impl.traitName).toBe("Display");
  expect(impl.name).toBe("Foo");
});

test("trait: declaration carries required + default-bodied methods", async () => {
  const ps = (await parts(`
    trait Greet {
      hello(self: Self): string
      hi(self: Self): string {
        return "hi from " .. Self.hello(self)
      }
    }
  `)).filter(notOpaque);
  const t = ps[0] as M.TraitDecl;
  expect(t.kind).toBe("trait");
  expect(t.name).toBe("Greet");
  expect(t.methods.map((m) => m.name)).toEqual(["hello", "hi"]);
  expect(t.methods[0]!.body).toBeUndefined();
  expect(t.methods[1]!.body).toBeDefined();
});

test("function: standalone declarations with params and return type", async () => {
  const ps = (await parts(`
    export function add(a: number, b: number): number {
      return a + b
    }
  `)).filter(notOpaque);
  const f = ps[0] as M.FunctionDecl;
  expect(f.kind).toBe("function");
  expect(f.name).toBe("add");
  expect(f.exported).toBe(true);
  expect(f.params).toContain("a: number");
  expect(f.params).toContain("b: number");
  expect(f.returnType.trim()).toBe("number");
});

test("function: attributes attach to the declaration", async () => {
  const ps = (await parts(`
    #[test]
    export function works(): void { }
  `)).filter(notOpaque);
  const f = ps[0] as M.FunctionDecl;
  expect(f.attrs.map((a) => a.name)).toEqual(["test"]);
});

test("source-order preservation: parts come back in lexical order", async () => {
  const ps = (await parts(`
    struct A { id: string }
    struct B { id: string }
    function f(): void { }
    struct C { id: string }
  `)).filter(notOpaque);
  expect(ps.map((p) => (p as { name: string }).name)).toEqual(["A", "B", "f", "C"]);
});

test("spans cover the whole declaration text", async () => {
  const src = `struct Foo { id: string }`;
  const ps = (await parts(src)).filter(notOpaque);
  const p = ps[0]!;
  // start at `struct`, end at the closing brace.
  expect(src.slice(p.span.start, p.span.end)).toContain("struct Foo");
  expect(src.slice(p.span.start, p.span.end)).toContain("id: string");
});
