/**
 * Inference tests for the binary / unary / call cases of
 * `inferExpression`. Pins the round-2 contract:
 *
 *   - Arithmetic operators (`+`, `-`, `*`, `/`, `%`, `^`)  → NUMBER
 *   - Comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) → BOOL
 *   - Short-circuit logicals (`&&`, `||`, `??`) → union of operands
 *   - Boolean negation (`!`) → BOOL
 *   - Numeric sign prefix (`-`, `+`) → NUMBER
 *   - Call of a `Fn` → its return type
 *   - Call of anything that isn't a callable → Unknown
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import { BOOL, NUMBER, STRING, display, equals } from "./type.ts";
import { buildModuleScope, TypeEnv } from "./env.ts";
import { inferExpression } from "./infer.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(
  root: unknown,
  predicate: (n: N.AstNode) => boolean,
): N.AstNode | undefined {
  if (!root || typeof root !== "object") return undefined;
  const bag = root as Record<string, unknown>;
  if (typeof bag.kind === "string" && predicate(root as N.AstNode)) {
    return root as N.AstNode;
  }
  for (const key of Object.keys(bag)) {
    if (key === "kind" || key === "text") continue;
    const v = bag[key];
    if (Array.isArray(v)) {
      for (const child of v) {
        const hit = findNode(child, predicate);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = findNode(v, predicate);
      if (hit) return hit;
    }
  }
  return undefined;
}

async function fnBody(source: string, fnName: string): Promise<N.StatementBlockNode> {
  const { module } = await parseViaTreeSitter(source);
  const fn = module.parts.find(
    (p) => p.kind === "function" && p.name === fnName,
  ) as { bodyAst?: N.StatementBlockNode } | undefined;
  if (!fn?.bodyAst) throw new Error(`no bodyAst for fn ${fnName}`);
  return fn.bodyAst;
}

// ---------------------------------------------------------------------------
// Binary expressions
// ---------------------------------------------------------------------------

test("arithmetic `1 + 2` infers to NUMBER", async () => {
  const body = await fnBody(`pub fn f() -> number { return 1 + 2 }`, "f");
  const bin = findNode(body, (n) => n.kind === "binary_expression");
  expect(bin).toBeDefined();
  expect(equals(inferExpression(bin, new TypeEnv()), NUMBER)).toBe(true);
});

test("each arithmetic operator yields NUMBER", async () => {
  for (const op of ["-", "*", "/", "%"]) {
    const body = await fnBody(`pub fn f() -> number { return 4 ${op} 2 }`, "f");
    const bin = findNode(body, (n) => n.kind === "binary_expression");
    expect(bin).toBeDefined();
    expect(equals(inferExpression(bin, new TypeEnv()), NUMBER)).toBe(true);
  }
});

test("comparison `n > 0` infers to BOOL", async () => {
  const source = `pub fn f(n: number) -> bool { return n > 0 }`;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  const body = await fnBody(source, "f");
  const bin = findNode(body, (n) => n.kind === "binary_expression");
  expect(bin).toBeDefined();
  expect(equals(inferExpression(bin, env), BOOL)).toBe(true);
});

test("every comparison operator yields BOOL", async () => {
  for (const op of ["==", "!=", "<", "<=", ">", ">="]) {
    const body = await fnBody(
      `pub fn f() -> bool { return 1 ${op} 2 }`,
      "f",
    );
    const bin = findNode(body, (n) => n.kind === "binary_expression");
    expect(bin).toBeDefined();
    expect(equals(inferExpression(bin, new TypeEnv()), BOOL)).toBe(true);
  }
});

test("short-circuit `a && b` unifies operand types into a union", async () => {
  // `a` is a number, `b` is a string — the result type for `a && b`
  // is the union of those, modelling Lua's "whichever side wins"
  // semantics that `&&` inherits in this dialect.
  const source = `
    pub fn f(a: number, b: string) -> number { return a && b }
  `;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  // Open a function scope mirroring the param types so identifier
  // lookups inside the body resolve to the declared types.
  env.push();
  env.define("a", { type: NUMBER, kind: "param" });
  env.define("b", { type: STRING, kind: "param" });
  const body = await fnBody(source, "f");
  const bin = findNode(body, (n) => n.kind === "binary_expression");
  expect(bin).toBeDefined();
  const t = inferExpression(bin, env);
  expect(t.kind).toBe("union");
  expect(display(t)).toBe("number | string");
});

// ---------------------------------------------------------------------------
// Unary expressions
// ---------------------------------------------------------------------------

test("boolean negation `!x` infers to BOOL", async () => {
  const source = `pub fn f(x: number) -> bool { return !x }`;
  const env = buildModuleScope((await parseViaTreeSitter(source)).module);
  const body = await fnBody(source, "f");
  const un = findNode(body, (n) => n.kind === "unary_expression");
  expect(un).toBeDefined();
  expect(equals(inferExpression(un, env), BOOL)).toBe(true);
});

test("numeric prefix `-5` infers to NUMBER", async () => {
  const body = await fnBody(`pub fn f() -> number { return -5 }`, "f");
  const un = findNode(body, (n) => n.kind === "unary_expression");
  expect(un).toBeDefined();
  expect(equals(inferExpression(un, new TypeEnv()), NUMBER)).toBe(true);
});

test("numeric prefix `+5` infers to NUMBER", async () => {
  const body = await fnBody(`pub fn f() -> number { return +5 }`, "f");
  const un = findNode(body, (n) => n.kind === "unary_expression");
  expect(un).toBeDefined();
  expect(equals(inferExpression(un, new TypeEnv()), NUMBER)).toBe(true);
});

// ---------------------------------------------------------------------------
// Call expressions
// ---------------------------------------------------------------------------

test("call of a top-level fn returns the fn's return type", async () => {
  const source = `
    pub fn target(a: number) -> number { return a }
    pub fn caller() -> number { return target(1) }
  `;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  const body = await fnBody(source, "caller");
  const call = findNode(body, (n) => n.kind === "call_expression");
  expect(call).toBeDefined();
  const t = inferExpression(call, env);
  expect(equals(t, NUMBER)).toBe(true);
});

test("call of a struct identifier returns the struct type (Foo.new shape)", async () => {
  // `Foo.new(...)` resolves via `inferMemberExpression` to a synthetic
  // `fn(data: Foo) -> Foo`. The call's result type is therefore the
  // struct itself. This exercises the call wiring against a Fn whose
  // return is a struct, which is the common factory pattern.
  const source = `
    struct Product { id: string }
    pub fn make() -> Product { return Product.new({ id: "x" }) }
  `;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  const body = await fnBody(source, "make");
  const call = findNode(body, (n) => n.kind === "call_expression");
  expect(call).toBeDefined();
  const t = inferExpression(call, { env, structs: structMap(module) });
  expect(t.kind).toBe("struct");
  expect(display(t)).toBe("Product");
});

test("call of a non-function expression returns Unknown", async () => {
  // `s` is a string parameter; calling it is nonsense, and inference
  // must surface that as Unknown rather than fabricate a return type.
  const source = `pub fn f(s: string) -> string { return s(1) }`;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  env.push();
  env.define("s", { type: STRING, kind: "param" });
  const body = await fnBody(source, "f");
  const call = findNode(body, (n) => n.kind === "call_expression");
  expect(call).toBeDefined();
  const t = inferExpression(call, env);
  expect(t.kind).toBe("unknown");
});

test("call whose callee is itself unknown propagates Unknown (no false positives)", async () => {
  const source = `pub fn f() -> number { return ghost(1) }`;
  const { module } = await parseViaTreeSitter(source);
  const env = buildModuleScope(module);
  const body = await fnBody(source, "f");
  const call = findNode(body, (n) => n.kind === "call_expression");
  expect(call).toBeDefined();
  const t = inferExpression(call, env);
  expect(t.kind).toBe("unknown");
});

// ---------------------------------------------------------------------------
// Helpers used only by the call-of-struct test
// ---------------------------------------------------------------------------

function structMap(module: Awaited<ReturnType<typeof parseViaTreeSitter>>["module"]) {
  // Mirror `buildStructMap` from `infer.ts` without importing it
  // here — keeps the test file decoupled from internals.
  const out = new Map<string, { fields: { name: string; type: string }[] }>();
  for (const part of module.parts) {
    if (part.kind === "struct") {
      out.set(part.name, { fields: part.fields });
    }
  }
  // Cast: the inferExpression contract only reads `.fields[*].name/type`,
  // matching the StructDecl interface the production code expects.
  return out as unknown as Map<string, import("../ast/index.ts").StructDecl>;
}

