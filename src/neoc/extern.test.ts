import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";
import { parseViaTreeSitter } from "./parser/adapter.ts";

test("`ext fn` parses as an ExternFunctionDecl, no Lua emitted", async () => {
  const src = `ext fn tonumber(s: string) -> number;`;
  const { module } = await parseViaTreeSitter(src);
  const part = module.parts.find((p) => p.kind === "extern_function");
  expect(part).toBeDefined();
  expect(part!.name).toBe("tonumber");
  expect(part!.signature).toBe("(s: string) -> number");
  expect(part!.params).toBe("s: string");
  expect(part!.returnType).toBe("number");

  const { lua } = await transpile(src);
  expect(lua.trim()).toBe("");
});

test("`pub ext fn` carries the exported flag", async () => {
  const { module } = await parseViaTreeSitter(`pub ext fn now() -> number;`);
  const part = module.parts.find((p) => p.kind === "extern_function");
  expect(part).toBeDefined();
  expect(part!.exported).toBe(true);
});

test("ext + regular fn coexist in the same module — only the regular fn emits", async () => {
  const { lua } = await transpile(`
    ext fn print(message: string);

    pub fn greet(name: string) -> string {
      return "hi"
    }
  `);
  expect(lua).not.toContain("print");
  expect(lua).toContain("function greet(name)");
});

test("`ext fn` with no return type still parses", async () => {
  const { module } = await parseViaTreeSitter(`ext fn log(message: string);`);
  const part = module.parts.find((p) => p.kind === "extern_function");
  expect(part).toBeDefined();
  expect(part!.returnType).toBe("");
});
