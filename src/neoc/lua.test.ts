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

test("trait default-bodied methods land on the implementing struct", async () => {
  const { lua } = await transpile(`
    trait Display {
      display(self: Self): string;
      label(self: Self): string {
        return "[" .. Self.display(self) .. "]"
      }
    }
    struct Point { x: number, y: number }
    impl Display for Point {
      display(self: Point): string {
        return self.x .. "," .. self.y
      }
    }
  `);
  // User-supplied trait method.
  expect(lua).toContain("function Point.display(self)");
  // Default-bodied trait method, with Self → Point.
  expect(lua).toContain("function Point.label(self)");
  expect(lua).toContain('return "[" .. Point.display(self) .. "]"');
});

test("`import { Foo } from \"./mod\"` translates to require + locals", async () => {
  const { lua } = await transpile(`
    import { Foo, Bar as B } from "./mod.neoc";
    export function f(): void {}
  `);
  expect(lua).toMatch(/local __mod_\w+ = require\("\.\/mod"\)/);
  expect(lua).toMatch(/local Foo = __mod_\w+\.Foo/);
  expect(lua).toMatch(/local B = __mod_\w+\.Bar/);
});

test("`import type { Foo } from \"./mod\"` is dropped entirely", async () => {
  const { lua } = await transpile(`
    import type { Foo } from "./mod.neoc";
    export function f(): void {}
  `);
  expect(lua).not.toContain("require");
  expect(lua).not.toContain("Foo");
});

test("`import * as M from \"./mod\"` translates to a single require", async () => {
  const { lua } = await transpile(`
    import * as M from "./mod.neoc";
    export function f(): void {}
  `);
  expect(lua).toContain(`local M = require("./mod")`);
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
