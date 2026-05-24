import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transpile } from "../../src/neoc/compiler.ts";

const SOURCE = readFileSync(
  fileURLToPath(new URL("./05-trait.neoc", import.meta.url)),
  "utf-8",
);

test("05-trait: transpile produces the expected Lua shape", async () => {
  const { lua, diagnostics } = await transpile(SOURCE);
  expect(diagnostics).toEqual([]);
  expect(lua).toMatchSnapshot();
});
