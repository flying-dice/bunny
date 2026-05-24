/**
 * Inference tests for the literal + identifier cases of
 * `inferExpression`. Pins the round-2 contract: every literal kind
 * lands on its matching primitive, and identifiers resolve against
 * the active `TypeEnv` (falling back to `Unknown<unbound: ...>` when
 * the name isn't visible).
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import {
  BOOL,
  NIL,
  NUMBER,
  STRING,
  display,
  equals,
} from "./type.ts";
import { buildModuleScope, TypeEnv } from "./env.ts";
import { inferExpression } from "./infer.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk `root` and return the first node whose `kind` matches.
 * Recurses through `children`, plus the well-known field slots used
 * by the generated AST shapes (`body`, `expression`, `left`, `right`,
 * etc.). Returns `undefined` when nothing matches.
 */
function findNode(root: unknown, predicate: (n: N.AstNode) => boolean): N.AstNode | undefined {
  if (!root || typeof root !== "object") return undefined;
  const bag = root as Record<string, unknown>;
  if (typeof bag.kind === "string" && predicate(root as N.AstNode)) return root as N.AstNode;
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

/** Return the first identifier node with `text === name`, anywhere under `root`. */
function findIdentifier(root: unknown, name: string): N.IdentifierNode | undefined {
  return findNode(
    root,
    (n) => n.kind === "identifier" && (n as N.IdentifierNode).text === name,
  ) as N.IdentifierNode | undefined;
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
// Literal cases
// ---------------------------------------------------------------------------

test("number literal infers to NUMBER", async () => {
  const body = await fnBody(`pub fn f() -> number { return 42 }`, "f");
  const lit = findNode(body, (n) => n.kind === "number");
  expect(lit).toBeDefined();
  expect(equals(inferExpression(lit, new TypeEnv()), NUMBER)).toBe(true);
});

test("string literal infers to STRING", async () => {
  const body = await fnBody(`pub fn f() -> string { return "hi" }`, "f");
  const lit = findNode(body, (n) => n.kind === "string");
  expect(lit).toBeDefined();
  expect(equals(inferExpression(lit, new TypeEnv()), STRING)).toBe(true);
});

test("template string literal infers to STRING", async () => {
  const body = await fnBody(`pub fn f() -> string { return \`hi\` }`, "f");
  const lit = findNode(body, (n) => n.kind === "template_string");
  expect(lit).toBeDefined();
  expect(equals(inferExpression(lit, new TypeEnv()), STRING)).toBe(true);
});

test("boolean literal infers to BOOL", async () => {
  const body = await fnBody(`pub fn f() -> bool { return true }`, "f");
  const lit = findNode(body, (n) => n.kind === "boolean");
  expect(lit).toBeDefined();
  expect(equals(inferExpression(lit, new TypeEnv()), BOOL)).toBe(true);
});

test("null + undefined literals infer to NIL", async () => {
  const body = await fnBody(`pub fn f() -> void { return null }`, "f");
  const lit = findNode(body, (n) => n.kind === "null_literal");
  expect(lit).toBeDefined();
  expect(equals(inferExpression(lit, new TypeEnv()), NIL)).toBe(true);

  const body2 = await fnBody(`pub fn g() -> void { return undefined }`, "g");
  const lit2 = findNode(body2, (n) => n.kind === "undefined_literal");
  expect(lit2).toBeDefined();
  expect(equals(inferExpression(lit2, new TypeEnv()), NIL)).toBe(true);
});

// ---------------------------------------------------------------------------
// Identifier resolution
// ---------------------------------------------------------------------------

test("identifier naming a top-level fn resolves to its FnType", async () => {
  const { module } = await parseViaTreeSitter(`
    pub fn target(a: number) -> number { return a }
    pub fn caller() -> number { return target }
  `);
  const env = buildModuleScope(module);
  const caller = module.parts.find(
    (p) => p.kind === "function" && p.name === "caller",
  ) as { bodyAst?: N.StatementBlockNode };
  const ident = findIdentifier(caller.bodyAst, "target");
  expect(ident).toBeDefined();
  const t = inferExpression(ident, env);
  expect(t.kind).toBe("fn");
  expect(display(t)).toBe("fn(a: number) -> number");
});

test("identifier naming a top-level struct resolves to Type.struct(name)", async () => {
  const { module } = await parseViaTreeSitter(`
    struct Product { id: string }
    pub fn caller() -> string { return Product }
  `);
  const env = buildModuleScope(module);
  const caller = module.parts.find(
    (p) => p.kind === "function" && p.name === "caller",
  ) as { bodyAst?: N.StatementBlockNode };
  const ident = findIdentifier(caller.bodyAst, "Product");
  expect(ident).toBeDefined();
  const t = inferExpression(ident, env);
  expect(t.kind).toBe("struct");
  expect(display(t)).toBe("Product");
});

test("identifier not in scope returns Unknown with reason `unbound: <name>`", async () => {
  const { module } = await parseViaTreeSitter(`
    pub fn caller() -> number { return ghost }
  `);
  const env = buildModuleScope(module);
  const caller = module.parts.find(
    (p) => p.kind === "function" && p.name === "caller",
  ) as { bodyAst?: N.StatementBlockNode };
  const ident = findIdentifier(caller.bodyAst, "ghost");
  expect(ident).toBeDefined();
  const t = inferExpression(ident, env);
  expect(t.kind).toBe("unknown");
  expect((t as { reason?: string }).reason).toBe("unbound: ghost");
});
