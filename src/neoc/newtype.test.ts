import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { transpile } from "./compiler.ts";

test("tuple-struct shorthand emits a single-field Lua factory", async () => {
  const { lua } = await transpile(`
    struct ProductId(string)
  `);
  expect(lua).toContain("local ProductId = {}");
  expect(lua).toContain("ProductId.__index = ProductId");
  expect(lua).toContain("function ProductId.new(data)");
  expect(lua).toContain(`data._struct = "ProductId"`);
  expect(lua).toContain("setmetatable(data, ProductId)");
});

test("exported tuple-struct drops the `local` prefix", async () => {
  const { lua } = await transpile(`
    pub struct UserId(number)
  `);
  expect(lua).toContain("UserId = {}");
  expect(lua).not.toContain("local UserId");
});

test("tuple-struct desugars to a StructDecl with a synthetic `value` field", async () => {
  const { module } = await parse(`struct ProductId(string)`);
  const decl = module.parts.find((p) => p.kind === "struct");
  if (!decl || decl.kind !== "struct") throw new Error("expected a struct part");
  expect(decl.name).toBe("ProductId");
  expect(decl.fields).toHaveLength(1);
  expect(decl.fields[0]!.name).toBe("value");
  expect(decl.fields[0]!.type).toBe("string");
  expect(decl.fields[0]!.attrs).toEqual([]);
});

test("`.new({ value = ... })` stamps the `_struct` brand", async () => {
  const { lua } = await transpile(`
    struct ProductId(string)
  `);
  expect(lua).toContain("function ProductId.new(data)");
  expect(lua).toContain(`data._struct = "ProductId"`);
  expect(lua).toContain("return data");
});

test("tuple-struct payload accepts a non-primitive type", async () => {
  const { lua } = await transpile(`
    struct Wrapper(Product)
  `);
  expect(lua).toContain("function Wrapper.new(data)");
  const { module } = await parse(`struct Wrapper(Product)`);
  const decl = module.parts.find((p) => p.kind === "struct");
  if (!decl || decl.kind !== "struct") throw new Error("expected a struct part");
  expect(decl.fields[0]!.type).toBe("Product");
});
