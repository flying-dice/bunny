import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("`expr?` in a `let` lowers to a guarded local binding", async () => {
  const { lua } = await transpile(`
    pub fn f() -> Result<number, string> {
      let v = parse()?;
      return Ok(v + 1)
    }
  `);
  expect(lua).toContain("local __r = parse()");
  expect(lua).toContain("if not __r.ok then return __r end");
  expect(lua).toContain("local v = __r.value");
});

test("`expr?;` at statement position lowers without binding the value", async () => {
  const { lua } = await transpile(`
    pub fn f() -> Result<number, string> {
      doWork()?;
      return Ok(0)
    }
  `);
  expect(lua).toContain("local __r = doWork()");
  expect(lua).toContain("if not __r.ok then return __r end");
  // No `__r.value` capture when the result was used only for its
  // short-circuit effect.
  expect(lua).not.toContain("local __r = doWork().value");
});

test("multiple `?` in one body get unique locals", async () => {
  const { lua } = await transpile(`
    pub fn f() -> Result<number, string> {
      let a = parseA()?;
      let b = parseB()?;
      return Ok(a + b)
    }
  `);
  expect(lua).toContain("local __r = parseA()");
  expect(lua).toContain("local a = __r.value");
  expect(lua).toContain("local __r_1 = parseB()");
  expect(lua).toContain("local b = __r_1.value");
});
