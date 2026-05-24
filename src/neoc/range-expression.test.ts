import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("`0..3` lowers to an exclusive sequence builder", async () => {
  const { lua } = await transpile(`
    pub fn f() {
      let xs = 0..3;
      return xs
    }
  `);
  // Exclusive upper bound becomes `end - 1` in the Lua numeric for.
  expect(lua).toContain("for i = 0, 3 - 1 do r[#r + 1] = i end");
  expect(lua).toContain("(function() local r = {}");
  expect(lua).toContain("return r end)()");
});

test("`0..=3` lowers to an inclusive sequence builder", async () => {
  const { lua } = await transpile(`
    pub fn f() {
      let xs = 0..=3;
      return xs
    }
  `);
  // Inclusive upper bound passes through unchanged.
  expect(lua).toContain("for i = 0, 3 do r[#r + 1] = i end");
});

test("variable bounds carry through the rewrite", async () => {
  const { lua } = await transpile(`
    pub fn f(a: number, b: number) {
      let xs = a..b;
      return xs
    }
  `);
  expect(lua).toContain("for i = a, b - 1 do r[#r + 1] = i end");
});
