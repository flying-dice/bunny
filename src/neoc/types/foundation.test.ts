/**
 * Foundation tests for the inference subsystem. Pins:
 *   - Type IR shape + display + equality
 *   - `parseType` covers primitives, structs, unions, unknowns
 *   - Module scope contains every top-level declaration
 *   - `bodyAst` is populated on FunctionDecl / ImplMethod / TraitMethod
 *
 * Subsequent rounds add typing-rule tests on top of this scaffold.
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import {
  ANY,
  BOOL,
  NIL,
  NUMBER,
  STRING,
  Type,
  UNKNOWN,
  display,
  equals,
  parseType,
} from "./type.ts";
import { buildModuleScope } from "./env.ts";

// -- Type IR ------------------------------------------------------------------

test("primitive constructors round-trip through display + equals", () => {
  expect(display(NUMBER)).toBe("number");
  expect(display(STRING)).toBe("string");
  expect(display(BOOL)).toBe("bool");
  expect(equals(NUMBER, NUMBER)).toBe(true);
  expect(equals(NUMBER, STRING)).toBe(false);
});

test("struct types display as their declared name", () => {
  const t = Type.struct("Product");
  expect(display(t)).toBe("Product");
  expect(equals(t, Type.struct("Product"))).toBe(true);
  expect(equals(t, Type.struct("Other"))).toBe(false);
});

test("union dedupes and collapses to bare type when one variant", () => {
  expect(display(Type.union([NUMBER, NUMBER]))).toBe("number");
  expect(display(Type.union([NUMBER, STRING]))).toBe("number | string");
  expect(display(Type.union([Type.union([NUMBER, STRING]), BOOL]))).toBe(
    "number | string | bool",
  );
});

test("`unknown` matches anything under structural equality (V1 contract)", () => {
  expect(equals(UNKNOWN, NUMBER)).toBe(true);
  expect(equals(NUMBER, UNKNOWN)).toBe(true);
});

test("fn type display + equality", () => {
  const f = Type.fn(
    [{ name: "a", type: NUMBER }, { name: "b", type: NUMBER }],
    NUMBER,
  );
  expect(display(f)).toBe("fn(a: number, b: number) -> number");
  const g = Type.fn(
    [{ name: "a", type: NUMBER }, { name: "b", type: NUMBER }],
    NUMBER,
  );
  expect(equals(f, g)).toBe(true);
});

// -- parseType ---------------------------------------------------------------

test("parseType: primitives", () => {
  expect(equals(parseType("number"), NUMBER)).toBe(true);
  expect(equals(parseType("string"), STRING)).toBe(true);
  expect(equals(parseType("bool"), BOOL)).toBe(true);
  expect(equals(parseType("nil"), NIL)).toBe(true);
  expect(equals(parseType("any"), ANY)).toBe(true);
});

test("parseType: struct identifier", () => {
  const t = parseType("Product");
  expect(t.kind).toBe("struct");
  expect((t as { name: string }).name).toBe("Product");
});

test("parseType: union", () => {
  const t = parseType("Cat | Dog | Fish");
  expect(t.kind).toBe("union");
  expect(display(t)).toBe("Cat | Dog | Fish");
});

test("parseType: empty string → unknown", () => {
  expect(parseType("").kind).toBe("unknown");
});

test("parseType: anything more elaborate → unknown<reason>", () => {
  const t = parseType("Result<number, Error>");
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("Result<number, Error>");
});

// -- Module scope -------------------------------------------------------------

test("module scope binds every top-level fn / struct / trait / ext fn", async () => {
  const { module } = await parseViaTreeSitter(`
    struct Product { id: string }
    trait Display { display(self: Self) -> string; }
    pub fn greet(name: string) -> string { return "hi" }
    ext fn tonumber(s: string) -> number;
  `);
  const env = buildModuleScope(module);
  expect(env.lookup("Product")?.kind).toBe("struct");
  expect(env.lookup("Display")?.kind).toBe("trait");
  expect(env.lookup("greet")?.kind).toBe("fn");
  expect(env.lookup("tonumber")?.kind).toBe("ext_fn");
  // Unknown names return undefined.
  expect(env.lookup("bogus")).toBeUndefined();
});

test("module scope captures fn parameter + return types", async () => {
  const { module } = await parseViaTreeSitter(`
    pub fn add(a: number, b: number) -> number { return a + b }
  `);
  const env = buildModuleScope(module);
  const entry = env.lookup("add");
  expect(entry).toBeDefined();
  expect(entry!.type.kind).toBe("fn");
  expect(display(entry!.type)).toBe("fn(a: number, b: number) -> number");
});

test("ext fn parameters + return survive into the type env", async () => {
  const { module } = await parseViaTreeSitter(`
    ext fn parse(s: string) -> number;
  `);
  const env = buildModuleScope(module);
  expect(display(env.lookup("parse")!.type)).toBe("fn(s: string) -> number");
});

// -- bodyAst plumbing --------------------------------------------------------

test("FunctionDecl carries a typed bodyAst alongside the lowered body text", async () => {
  const { module } = await parseViaTreeSitter(`
    pub fn add(a: number, b: number) -> number {
      return a + b
    }
  `);
  const fn = module.parts.find((p) => p.kind === "function");
  expect(fn).toBeDefined();
  // The lowered text body is what codegen emits.
  expect(typeof (fn as { body: string }).body).toBe("string");
  // The typed AST sibling is what inference will walk.
  expect((fn as { bodyAst?: unknown }).bodyAst).toBeDefined();
  expect(((fn as { bodyAst?: { kind: string } }).bodyAst as { kind: string }).kind).toBe(
    "statement_block",
  );
});

test("ImplMethod carries bodyAst too", async () => {
  const { module } = await parseViaTreeSitter(`
    struct Counter { n: number }
    impl Counter {
      bump(self: Counter) -> void { self.n = self.n + 1 }
    }
  `);
  const impl = module.parts.find((p) => p.kind === "impl") as {
    methods: { bodyAst?: { kind: string } }[];
  };
  expect(impl.methods[0]!.bodyAst).toBeDefined();
  expect(impl.methods[0]!.bodyAst!.kind).toBe("statement_block");
});
