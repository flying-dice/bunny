/**
 * Inference tests for `member_expression` and `subscript_expression`.
 * Pins the round-2 contract for member access:
 *   - `Struct.new` synthesises `fn(data: Struct) -> Struct`.
 *   - `Struct.new({...})` (call of that member) returns the struct.
 *   - `instance.field` returns the field's declared type.
 *   - `instance.unknownField` returns `Unknown` with a reason that
 *     names the missing field.
 *   - `arr[i]` stays Unknown for V1 (no array-element typing yet).
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import { NUMBER, STRING, Type, display, equals } from "./type.ts";
import { buildModuleScope } from "./env.ts";
import { buildStructMap, inferExpression, type InferCtx } from "./infer.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk an object tree and return the first descendant whose `kind`
 * matches the predicate. Mirrors the helper in `infer-literals.test.ts`
 * so tests stay self-contained.
 */
function findNode(root: unknown, predicate: (n: N.AstNode) => boolean): N.AstNode | undefined {
  if (!root || typeof root !== "object") return undefined;
  const node = root as N.AstNode & { children?: unknown };
  if (typeof (node as { kind?: unknown }).kind === "string" && predicate(node)) return node;
  for (const key of Object.keys(node)) {
    if (key === "kind" || key === "text") continue;
    const v = (node as unknown as Record<string, unknown>)[key];
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

async function buildCtx(source: string): Promise<{
  ctx: InferCtx;
  bodyOf: (fnName: string) => N.StatementBlockNode;
}> {
  const { module } = await parseViaTreeSitter(source);
  const ctx: InferCtx = {
    env: buildModuleScope(module),
    structs: buildStructMap(module),
  };
  const bodyOf = (fnName: string): N.StatementBlockNode => {
    const fn = module.parts.find(
      (p) => p.kind === "function" && p.name === fnName,
    ) as { bodyAst?: N.StatementBlockNode } | undefined;
    if (!fn?.bodyAst) throw new Error(`no bodyAst for fn ${fnName}`);
    return fn.bodyAst;
  };
  return { ctx, bodyOf };
}

// ---------------------------------------------------------------------------
// Struct-static path: `Struct.new` synthesised constructor
// ---------------------------------------------------------------------------

test("Struct.new resolves to fn(data: Struct) -> Struct", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    pub fn make() -> Product { return Product.new }
  `);
  const member = findNode(
    bodyOf("make"),
    (n) => n.kind === "member_expression",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(display(t)).toBe("fn(data: Product) -> Product");
});

test("Struct.new(...) call returns the struct type", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    pub fn make() -> Product { return Product.new({ id: "x" }) }
  `);
  const call = findNode(bodyOf("make"), (n) => n.kind === "call_expression");
  expect(call).toBeDefined();
  const t = inferExpression(call, ctx);
  expect(t.kind).toBe("struct");
  expect(display(t)).toBe("Product");
});

test("unknown static on a struct returns Unknown with descriptive reason", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    pub fn make() -> string { return Product.bogus }
  `);
  const member = findNode(
    bodyOf("make"),
    (n) => n.kind === "member_expression",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("no static bogus on Product");
});

// ---------------------------------------------------------------------------
// Instance-field path
// ---------------------------------------------------------------------------

// Function-parameter scoping lands in a later round; until then,
// tests bind the instance manually so the LHS resolves to a struct
// type. The member-access logic under test is the same either way.
test("instance.field returns the field's declared type", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string, qty: number }
    pub fn read(p: Product) -> string { return p.id }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("read"),
    (n) => n.kind === "member_expression"
      && (n as N.MemberExpressionNode).property.text === "id",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(equals(t, STRING)).toBe(true);
});

test("instance.field picks up the numeric field type too", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string, qty: number }
    pub fn readQty(p: Product) -> number { return p.qty }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("readQty"),
    (n) => n.kind === "member_expression"
      && (n as N.MemberExpressionNode).property.text === "qty",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(equals(t, NUMBER)).toBe(true);
});

test("instance.unknownField returns Unknown with `no field <name> on <Struct>`", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    pub fn bad(p: Product) -> string { return p.missing }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("bad"),
    (n) => n.kind === "member_expression"
      && (n as N.MemberExpressionNode).property.text === "missing",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("no field missing on Product");
});

// ---------------------------------------------------------------------------
// Subscript stays Unknown for V1
// ---------------------------------------------------------------------------

test("subscript expression is Unknown for V1", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn pick(xs: string, i: number) -> string { return xs[i] }
  `);
  const sub = findNode(bodyOf("pick"), (n) => n.kind === "subscript_expression");
  expect(sub).toBeDefined();
  const t = inferExpression(sub, ctx);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("subscript_expression");
});
