import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("trivial block expression lowers to an IIFE returning the final value", async () => {
  // Block expressions require at least one statement so opaque Lua-style
  // table literals (`{ x = v, y = v }`) inside method bodies still parse
  // as object_literal / opaque text rather than block_expression.
  const { lua } = await transpile(`
    pub fn f() {
      let x = { let _ = 0; 42 };
      return x
    }
  `);
  expect(lua).toContain("(function() let _ = 0; return 42 end)()");
});

test("block expression with statements returns its final expression", async () => {
  const { lua } = await transpile(`
    pub fn f() {
      let x = { let a = 1; a + 1 };
      return x
    }
  `);
  // Statements land before the `return`; final expression follows.
  expect(lua).toContain("(function() let a = 1;");
  expect(lua).toContain("return a + 1 end)()");
});

test("block expression on the RHS of a let binding", async () => {
  const { lua } = await transpile(`
    pub fn f() {
      let x = {
        let a = 5
        let b = 10
        a + b
      };
      return x
    }
  `);
  expect(lua).toContain("(function()");
  expect(lua).toContain("return a + b end)()");
});

test("block-expression IIFE introduces its own scope", async () => {
  const { lua } = await transpile(`
    pub fn f() {
      let x = { let inner = 1; inner };
      return x
    }
  `);
  // The IIFE wraps statements + return — the `inner` local lives
  // inside the function, not in the outer scope.
  expect(lua).toMatch(/\(function\(\)\s+let inner = 1;\s+return inner end\)\(\)/);
});
