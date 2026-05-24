/**
 * Inference tests for `match_expression` and `try_expression`. Pins the
 * round-3 contract:
 *
 *   - A match whose arms all share a type collapses the union back to
 *     that type (e.g. every arm string → STRING).
 *   - A match with mixed arm types reports the union verbatim.
 *   - Struct shorthand patterns bring field bindings into the arm
 *     scope, and the arm body sees the field's declared type.
 *   - Arm bindings don't leak past the arm.
 *   - `expr?` is Unknown for V1 with a descriptive reason.
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import { NUMBER, STRING, display, equals } from "./type.ts";
import { buildModuleScope } from "./env.ts";
import { buildStructMap, inferExpression, type InferCtx } from "./infer.ts";

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
// match_expression
// ---------------------------------------------------------------------------

test("match with uniform string arms collapses to STRING", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn name(x: number) -> string {
      return match x {
        1 => "one",
        2 => "two",
        _ => "other",
      }
    }
  `);
  ctx.env.define("x", { type: NUMBER, kind: "param" });
  const m = findNode(bodyOf("name"), (n) => n.kind === "match_expression");
  expect(m).toBeDefined();
  const t = inferExpression(m, ctx);
  expect(equals(t, STRING)).toBe(true);
});

test("match with mixed arm types reports the union", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn mixed(x: number) -> string {
      return match x {
        1 => "one",
        _ => 0,
      }
    }
  `);
  ctx.env.define("x", { type: NUMBER, kind: "param" });
  const m = findNode(bodyOf("mixed"), (n) => n.kind === "match_expression");
  expect(m).toBeDefined();
  const t = inferExpression(m, ctx);
  expect(t.kind).toBe("union");
  // Display order follows insertion: first string, then number.
  expect(display(t)).toBe("string | number");
});

test("struct shorthand pattern binds the field's declared type into the arm", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Foo { n: number, label: string }
    pub fn pick(f: Foo) -> number {
      return match f {
        Foo { n } => n,
        _ => 0,
      }
    }
  `);
  ctx.env.define("f", { type: { kind: "struct", name: "Foo" }, kind: "param" });
  const m = findNode(bodyOf("pick"), (n) => n.kind === "match_expression");
  expect(m).toBeDefined();
  const t = inferExpression(m, ctx);
  // Both arms return NUMBER (`n` is number, the `_` arm is `0`).
  expect(equals(t, NUMBER)).toBe(true);
});

test("struct pattern_bind (renamed) binds the field's declared type", async () => {
  // `Foo { n: renamed }` parses as a pattern_bind with key=n, binding=renamed
  // — i.e. "read field `n`, expose it as local `renamed`".
  const { ctx, bodyOf } = await buildCtx(`
    struct Foo { n: number }
    pub fn pick(f: Foo) -> number {
      return match f {
        Foo { n: renamed } => renamed,
        _ => 0,
      }
    }
  `);
  ctx.env.define("f", { type: { kind: "struct", name: "Foo" }, kind: "param" });
  const m = findNode(bodyOf("pick"), (n) => n.kind === "match_expression");
  expect(m).toBeDefined();
  const t = inferExpression(m, ctx);
  expect(equals(t, NUMBER)).toBe(true);
});

test("arm bindings don't leak past the match expression", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Foo { n: number }
    pub fn pick(f: Foo) -> number {
      return match f {
        Foo { n } => n,
        _ => 0,
      }
    }
  `);
  ctx.env.define("f", { type: { kind: "struct", name: "Foo" }, kind: "param" });
  const m = findNode(bodyOf("pick"), (n) => n.kind === "match_expression");
  inferExpression(m, ctx);
  // `n` was only visible inside the first arm.
  expect(ctx.env.lookup("n")).toBeUndefined();
});

test("binding pattern (`x => ...`) makes the scrutinee type visible in the arm", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn echo(s: string) -> string {
      return match s {
        v => v,
      }
    }
  `);
  ctx.env.define("s", { type: STRING, kind: "param" });
  const m = findNode(bodyOf("echo"), (n) => n.kind === "match_expression");
  expect(m).toBeDefined();
  const t = inferExpression(m, ctx);
  expect(equals(t, STRING)).toBe(true);
});

// ---------------------------------------------------------------------------
// try_expression
// ---------------------------------------------------------------------------

test("try expression narrows Result<T, E> down to T", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct User { id: string }
    struct Error { msg: string }
    ext fn loadUser(id: string) -> Result<User, Error>;
    pub fn run(id: string) -> User { return loadUser(id)? }
  `);
  const tryNode = findNode(bodyOf("run"), (n) => n.kind === "try_expression");
  expect(tryNode).toBeDefined();
  const t = inferExpression(tryNode, ctx);
  // `Result<User, Error>?` should narrow to `User`.
  expect(t.kind).toBe("struct");
  expect((t as { name: string }).name).toBe("User");
});

test("try expression on a non-Result inner expression stays Unknown", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    ext fn parseInt(s: string) -> number;
    pub fn run(s: string) -> number { return parseInt(s)? }
  `);
  const tryNode = findNode(bodyOf("run"), (n) => n.kind === "try_expression");
  expect(tryNode).toBeDefined();
  const t = inferExpression(tryNode, ctx);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toContain("try: ");
});
