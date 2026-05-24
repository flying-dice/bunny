import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transpile } from "../../src/neoc/compiler.ts";

const SOURCE = readFileSync(
  fileURLToPath(new URL("./08-pattern-guard.neoc", import.meta.url)),
  "utf-8",
);

test("08-pattern-guard: transpile produces the expected Lua shape", async () => {
  const { lua, diagnostics } = await transpile(SOURCE);
  expect(diagnostics).toEqual([]);
  expect(lua).toMatchSnapshot();
});
