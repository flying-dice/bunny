/**
 * Tests for `inferBody` — the statement walker that lifts
 * expression-level inference into body-wide identifier-to-type maps.
 *
 * Pins the round-3 contract:
 *   - `let x = expr` records `x` and propagates the value's type into
 *     the active scope.
 *   - Subsequent references to a local pick up the recorded type.
 *   - Unbound identifiers surface a diagnostic.
 *   - Match-arm struct patterns bind names with their field types
 *     scoped to the arm body.
 */
import { expect, test } from "bun:test";
import { parseViaTreeSitter } from "../parser/adapter.ts";
import type * as N from "../ast/nodes.generated.ts";
import { NUMBER, STRING, display, equals, parseType } from "./type.ts";
import { buildModuleScope } from "./env.ts";
import { buildStructMap, type InferCtx } from "./infer.ts";
import { inferBody } from "./walk.ts";

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

function findAllIdentifiers(root: unknown, name: string): N.IdentifierNode[] {
  const out: N.IdentifierNode[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const bag = n as Record<string, unknown>;
    if (bag.kind === "identifier" && bag.text === name) {
      out.push(n as N.IdentifierNode);
    }
    for (const key of Object.keys(bag)) {
      if (key === "kind" || key === "text") continue;
      const v = bag[key];
      if (Array.isArray(v)) for (const c of v) visit(c);
      else if (v && typeof v === "object") visit(v);
    }
  };
  visit(root);
  return out;
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
// `let` records binding + RHS
// ---------------------------------------------------------------------------

test("let x = 42 records the binding as NUMBER", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn f() -> number { let x = 42; return x }
  `);
  const body = bodyOf("f");
  const result = inferBody(body, ctx);

  const decl = findNode(
    body,
    (n) => n.kind === "variable_declaration",
  ) as N.VariableDeclarationNode | undefined;
  expect(decl).toBeDefined();

  const bindType = result.types.get(decl!.name.startIndex);
  expect(bindType).toBeDefined();
  expect(equals(bindType!, NUMBER)).toBe(true);

  const lit = findNode(decl!, (n) => n.kind === "number");
  expect(lit).toBeDefined();
  const litType = result.types.get(lit!.startIndex);
  expect(equals(litType!, NUMBER)).toBe(true);
});

test("subsequent reference to a local picks up the binding's type", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn f() -> number { let x = 42; return x }
  `);
  const body = bodyOf("f");
  const result = inferBody(body, ctx);

  const refs = findAllIdentifiers(body, "x");
  // First identifier is the binding name; the rest are references.
  expect(refs.length).toBeGreaterThanOrEqual(2);
  const ref = refs[refs.length - 1]!;
  const refType = result.types.get(ref.startIndex);
  expect(refType).toBeDefined();
  expect(equals(refType!, NUMBER)).toBe(true);
});

// ---------------------------------------------------------------------------
// Cross-statement inference via `ext fn`
// ---------------------------------------------------------------------------

test("let n = parseInt(s) picks up the ext fn's return type", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    ext fn parseInt(s: string) -> number;
    pub fn f() -> number {
      let s = "42";
      let n = parseInt(s);
      return n
    }
  `);
  const body = bodyOf("f");
  const result = inferBody(body, ctx);

  const decls = [...body.children].filter(
    (c) => c.kind === "variable_declaration",
  ) as N.VariableDeclarationNode[];
  expect(decls.length).toBe(2);
  const [sDecl, nDecl] = decls;

  expect(equals(result.types.get(sDecl!.name.startIndex)!, STRING)).toBe(true);
  expect(equals(result.types.get(nDecl!.name.startIndex)!, NUMBER)).toBe(true);

  // The reference `parseInt(s)` records `s` with STRING at the call site.
  const sRefs = findAllIdentifiers(nDecl!.value, "s");
  expect(sRefs.length).toBe(1);
  expect(equals(result.types.get(sRefs[0]!.startIndex)!, STRING)).toBe(true);
});

// ---------------------------------------------------------------------------
// Unbound identifier surfaces a diagnostic
// ---------------------------------------------------------------------------

test("reference to an undeclared identifier surfaces a diagnostic", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn f() -> number { return ghost }
  `);
  const body = bodyOf("f");
  const result = inferBody(body, ctx);

  expect(result.diagnostics.length).toBe(1);
  expect(result.diagnostics[0]!.message).toBe("unbound: ghost");

  const ghost = findAllIdentifiers(body, "ghost")[0]!;
  const t = result.types.get(ghost.startIndex);
  expect(t).toBeDefined();
  expect(t!.kind).toBe("unknown");
});

// ---------------------------------------------------------------------------
// Nested let-in-block participates in inference
// ---------------------------------------------------------------------------

test("nested let inside a statement block doesn't leak out", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn f() -> number {
      let x = 1;
      {
        let y = 2;
        return y
      }
    }
  `);
  const body = bodyOf("f");
  const result = inferBody(body, ctx);

  const yIdents = findAllIdentifiers(body, "y");
  expect(yIdents.length).toBeGreaterThanOrEqual(2);
  // Every recorded `y` site infers to NUMBER while the nested block
  // is in scope.
  for (const id of yIdents) {
    const t = result.types.get(id.startIndex);
    if (!t) continue;
    expect(equals(t, NUMBER)).toBe(true);
  }

  // After the body has been walked the outer scope no longer holds
  // `y`. The walker has popped the nested scope on the way out.
  expect(ctx.env.lookup("y")).toBeUndefined();
  expect(ctx.env.lookup("x")).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Match-arm struct pattern binds field types
// ---------------------------------------------------------------------------

test("match arm with struct shorthand binds field types into the arm scope", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct Product { id: string, qty: number }
    pub fn label(p: Product) -> string {
      return match p {
        Product { id } => id,
        _ => "fallback",
      }
    }
  `);
  const body = bodyOf("label");
  const result = inferBody(body, ctx);

  // The shorthand `id` binding inside the arm should appear in the
  // type map as STRING. Two `id` identifiers exist: the pattern key
  // and the arm-body reference. Both should resolve to STRING.
  const idents = findAllIdentifiers(body, "id");
  expect(idents.length).toBeGreaterThanOrEqual(2);
  for (const id of idents) {
    const t = result.types.get(id.startIndex);
    expect(t).toBeDefined();
    expect(display(t!)).toBe("string");
  }

  // The binding shouldn't leak past the arm.
  expect(ctx.env.lookup("id")).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Exhaustiveness on struct unions
// ---------------------------------------------------------------------------

test("match on a struct union flags missing variants", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct A {}
    struct B {}
    struct C {}
    pub fn pick(x: A | B | C) -> string {
      return match x {
        A => "a",
        B => "b",
      }
    }
  `);
  ctx.env.define("x", {
    type: { kind: "union", variants: [
      { kind: "struct", name: "A" },
      { kind: "struct", name: "B" },
      { kind: "struct", name: "C" },
    ] },
    kind: "param",
  });
  const result = inferBody(bodyOf("pick"), ctx);
  const exhaust = result.diagnostics.find((d) =>
    d.message.startsWith("non-exhaustive match"),
  );
  expect(exhaust).toBeDefined();
  expect(exhaust!.message).toContain("C");
});

test("wildcard arm satisfies exhaustiveness", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct A {}
    struct B {}
    pub fn pick(x: A | B) -> string {
      return match x {
        A => "a",
        _ => "rest",
      }
    }
  `);
  ctx.env.define("x", {
    type: { kind: "union", variants: [
      { kind: "struct", name: "A" },
      { kind: "struct", name: "B" },
    ] },
    kind: "param",
  });
  const result = inferBody(bodyOf("pick"), ctx);
  const exhaust = result.diagnostics.find((d) =>
    d.message.startsWith("non-exhaustive match"),
  );
  expect(exhaust).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Return-type checking
// ---------------------------------------------------------------------------

test("return type mismatch surfaces a diagnostic", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn label() -> number {
      return "hello"
    }
  `);
  ctx.expectedReturn = NUMBER;
  const result = inferBody(bodyOf("label"), ctx);
  const mismatch = result.diagnostics.find((d) =>
    d.message.startsWith("return type mismatch"),
  );
  expect(mismatch).toBeDefined();
  expect(mismatch!.message).toContain("expected number");
  expect(mismatch!.message).toContain("got string");
});

test("matching return type stays silent", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    pub fn label() -> string {
      return "hello"
    }
  `);
  ctx.expectedReturn = STRING;
  const result = inferBody(bodyOf("label"), ctx);
  const mismatch = result.diagnostics.find((d) =>
    d.message.startsWith("return type mismatch"),
  );
  expect(mismatch).toBeUndefined();
});

test("Result<any, any> from `Ok(...)` satisfies a declared Result<T, E>", async () => {
  // `Ok` is seeded as `fn(value: any) -> Result<any, any>` because we
  // don't yet infer the type parameters from the call site. The
  // permissive treatment of `any` in `equals` means returning `Ok(42)`
  // still satisfies a declared `Result<number, ParseError>` — no
  // false-positive mismatch.
  const { ctx, bodyOf } = await buildCtx(`
    struct ParseError {}
    pub fn run() -> Result<number, ParseError> {
      return Ok(42)
    }
  `);
  ctx.expectedReturn = parseType("Result<number, ParseError>");
  const result = inferBody(bodyOf("run"), ctx);
  const mismatch = result.diagnostics.find((d) =>
    d.message.startsWith("return type mismatch"),
  );
  expect(mismatch).toBeUndefined();
});

test("full coverage of a struct union reports no diagnostic", async () => {
  const { ctx, bodyOf } = await buildCtx(`
    struct A { n: number }
    struct B { s: string }
    pub fn pick(x: A | B) -> string {
      return match x {
        A { n } => "a",
        B { s } => s,
      }
    }
  `);
  ctx.env.define("x", {
    type: { kind: "union", variants: [
      { kind: "struct", name: "A" },
      { kind: "struct", name: "B" },
    ] },
    kind: "param",
  });
  const result = inferBody(bodyOf("pick"), ctx);
  const exhaust = result.diagnostics.find((d) =>
    d.message.startsWith("non-exhaustive match"),
  );
  expect(exhaust).toBeUndefined();
});
