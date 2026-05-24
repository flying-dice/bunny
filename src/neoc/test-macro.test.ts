import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("`#[test]` registers the fn in __neoc_tests", async () => {
  const { lua } = await transpile(`
    #[test]
    pub fn addition_works(): void {
      assert(1 + 1 == 2)
    }
  `);
  expect(lua).toContain("function addition_works()");
  expect(lua).toMatch(/__neoc_tests\[#__neoc_tests \+ 1\] = \{ name = "addition_works", run = addition_works \}/);
});

test("`#[test]` leaves the fn body intact", async () => {
  const { lua } = await transpile(`
    #[test]
    pub fn compare(): void {
      assert(1 + 1 == 2)
    }
  `);
  expect(lua).toContain("assert(1 + 1 == 2)");
});

test("`#[test]` registers each annotated function", async () => {
  const { lua } = await transpile(`
    #[test]
    pub fn a(): void { assert(true) }

    #[test]
    pub fn b(): void { assert(true) }
  `);
  expect(lua).toMatch(/run = a \}/);
  expect(lua).toMatch(/run = b \}/);
});
