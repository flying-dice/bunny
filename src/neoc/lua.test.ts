import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("struct emits a Lua factory + metatable", async () => {
  const { lua } = await transpile(`
    struct Product {
      id: string,
      name: string,
    }
  `);
  expect(lua).toContain("local Product = {}");
  expect(lua).toContain("Product.__index = Product");
  expect(lua).toContain("function Product.new(data)");
  expect(lua).toContain(`data._struct = "Product"`);
  expect(lua).toContain("setmetatable(data, Product)");
});

test("exported struct drops the `local` prefix", async () => {
  const { lua } = await transpile(`
    export struct Product { id: string }
  `);
  expect(lua).toContain("Product = {}");
  expect(lua).not.toContain("local Product");
});

test("field constraints emit Lua runtime guards in `.new`", async () => {
  const { lua } = await transpile(`
    struct Product {
      #[minLength(1)]
      name: string,
      #[minimum(0)]
      stock: number,
    }
  `);
  expect(lua).toContain('if #data.name < 1 then error("Product.name: minLength 1") end');
  expect(lua).toContain('if data.stock < 0 then error("Product.stock: minimum 0") end');
});

test("derive Clone emits a per-struct clone function", async () => {
  const { lua } = await transpile(`
    #[derive(Clone)]
    struct Point { x: number, y: number }
  `);
  expect(lua).toContain("function Point.clone(self)");
  expect(lua).toContain("for k, v in pairs(self) do copy[k] = v end");
  expect(lua).toContain("setmetatable(copy, Point)");
});

test("derive Equals emits a per-struct structural equality function", async () => {
  const { lua } = await transpile(`
    #[derive(Equals)]
    struct Point { x: number, y: number }
  `);
  expect(lua).toContain("function Point.equals(a, b)");
  expect(lua).toContain("return a.x == b.x and a.y == b.y");
});

test("impl methods attach to the struct's table as `function Foo.method`", async () => {
  const { lua } = await transpile(`
    struct Counter { n: number }
    impl Counter {
      increment(self: Counter): void {
        self.n = self.n + 1
      }
    }
  `);
  expect(lua).toContain("function Counter.increment(self)");
  expect(lua).toContain("self.n = self.n + 1");
});

test("match on a struct union lowers to a Lua IIFE", async () => {
  const { lua } = await transpile(`
    struct Cat {}
    struct Dog {}
    export function sound(animal: Cat | Dog): string {
      return match animal {
        Cat => "meow",
        Dog => "woof",
        _ => "unknown",
      }
    }
  `);
  expect(lua).toContain('if type(__m) == "table" and __m._struct == "Cat" then return "meow" end');
  expect(lua).toContain('if type(__m) == "table" and __m._struct == "Dog" then return "woof" end');
  // Wildcard arm makes the match exhaustive at the Lua level — no
  // trailing error fallback is emitted (Lua forbids statements after
  // a `return`).
  expect(lua).not.toContain('error("match: no arm matched")');
  expect(lua).toContain('return "unknown"');
});
