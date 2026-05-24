/**
 * Inference tests for `range_expression`, `block_expression`, and
 * instance-method dispatch through `member_expression` + `call_expression`.
 *
 * Pins:
 *   - `0..5` and `0..=5` both type as `table` (the lowering wraps an
 *     IIFE that returns a Lua sequence of numbers).
 *   - A block expression types as its trailing expression.
 *   - `instance.method` resolves through the impl table to a FnType.
 *   - `instance.method(args)` yields the FnType's return type.
 *   - Missing methods report `no method <name> on <Struct>`.
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import { NUMBER, STRING, TABLE, Type, equals } from "./type.ts";
import { buildModuleScope } from "./env.ts";
import {
  buildImplMap,
  buildStructMap,
  inferExpression,
  type InferCtx,
} from "./infer.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(
  root: unknown,
  predicate: (n: N.AstNode) => boolean,
): N.AstNode | undefined {
  if (!root || typeof root !== "object") return undefined;
  const node = root as N.AstNode & { children?: unknown };
  if (typeof (node as { kind?: unknown }).kind === "string" && predicate(node)) {
    return node;
  }
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
    impls: buildImplMap(module),
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
// range_expression
// ---------------------------------------------------------------------------

test("exclusive range `a..b` types as table", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn run() -> table { return 0..5 }
  `);
  const range = findNode(bodyOf("run"), (n) => n.kind === "range_expression");
  expect(range).toBeDefined();
  const t = inferExpression(range, ctx);
  expect(equals(t, TABLE)).toBe(true);
});

test("inclusive range `a..=b` types as table", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn run() -> table { return 0..=5 }
  `);
  const range = findNode(bodyOf("run"), (n) => n.kind === "range_expression");
  expect(range).toBeDefined();
  const t = inferExpression(range, ctx);
  expect(equals(t, TABLE)).toBe(true);
});

// ---------------------------------------------------------------------------
// block_expression
// ---------------------------------------------------------------------------

test("block with trailing numeric expression types as number", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn run() -> number { return { print("x"); 42 } }
  `);
  const block = findNode(bodyOf("run"), (n) => n.kind === "block_expression");
  expect(block).toBeDefined();
  const t = inferExpression(block, ctx);
  expect(equals(t, NUMBER)).toBe(true);
});

test("block with trailing string expression types as string", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn run() -> string { return { print("x"); "hello" } }
  `);
  const block = findNode(bodyOf("run"), (n) => n.kind === "block_expression");
  expect(block).toBeDefined();
  const t = inferExpression(block, ctx);
  expect(equals(t, STRING)).toBe(true);
});

// ---------------------------------------------------------------------------
// Instance method dispatch
// ---------------------------------------------------------------------------

test("instance.method resolves to the method's FnType", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    impl Product {
      fn label(self) -> string { return self.id }
    }
    pub fn read(p: Product) -> string { return p.label }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("read"),
    (n) =>
      n.kind === "member_expression" &&
      (n as N.MemberExpressionNode).property.text === "label",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(t.kind).toBe("fn");
  expect((t as { ret: { kind: string } }).ret.kind).toBe("primitive");
  expect(equals((t as { ret: { kind: string } }).ret as never, STRING)).toBe(true);
});

test("instance.method(args) returns the method's return type", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    impl Product {
      fn label(self) -> string { return self.id }
    }
    pub fn read(p: Product) -> string { return p.label() }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const call = findNode(
    bodyOf("read"),
    (n) => n.kind === "call_expression",
  );
  expect(call).toBeDefined();
  const t = inferExpression(call, ctx);
  expect(equals(t, STRING)).toBe(true);
});

test("missing instance method returns Unknown with descriptive reason", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    impl Product {
      fn label(self) -> string { return self.id }
    }
    pub fn read(p: Product) -> string { return p.missing }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("read"),
    (n) =>
      n.kind === "member_expression" &&
      (n as N.MemberExpressionNode).property.text === "missing",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("no method missing on Product");
});

test("field wins over a same-named method when both exist", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string }
    impl Product {
      fn id(self) -> number { return 0 }
    }
    pub fn read(p: Product) -> string { return p.id }
  `);
  ctx.env.define("p", { type: Type.struct("Product"), kind: "param" });
  const member = findNode(
    bodyOf("read"),
    (n) =>
      n.kind === "member_expression" &&
      (n as N.MemberExpressionNode).property.text === "id",
  );
  expect(member).toBeDefined();
  const t = inferExpression(member, ctx);
  expect(equals(t, STRING)).toBe(true);
});
