import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("tryNew is not emitted when the struct has no constraints", async () => {
  const { ts, usesResult } = await transpile(`
    struct Foo { id: string }
    impl Foo { new(data: Foo): Foo { return data; } }
  `);
  expect(ts).not.toContain("tryNew");
  expect(usesResult).toBe(false);
});

test("tryNew emitted and usesResult flag set when constraints exist", async () => {
  const { ts, usesResult } = await transpile(`
    struct Foo {
      #[minLength(1)]
      name: string,
    }
  `);
  expect(usesResult).toBe(true);
  expect(ts).toContain(`tryNew(data: Omit<Foo, "_struct">): Result<Foo, ConstraintError>`);
  expect(ts).toContain('return Err({ field: "name"');
  // The shared neoc.d.ts/neoc.runtime.ts provide Result/Ok/Err
  // ambiently; the compiled .ts no longer carries an inlined prelude.
  expect(ts).not.toContain("Result runtime");
});

test("tryNew chains through nested struct tryNew calls", async () => {
  const { ts } = await transpile(`
    struct Inner {
      #[minLength(1)]
      name: string,
    }
    struct Outer {
      inner: Inner,
    }
  `);
  expect(ts).toContain("const __r_inner = Inner.tryNew(data.inner)");
  expect(ts).toContain("if (!__r_inner.ok) return __r_inner;");
  expect(ts).toContain("data.inner = __r_inner.value;");
});

test("optional deep field guards with undefined check", async () => {
  const { ts } = await transpile(`
    struct Inner {
      #[minLength(1)]
      name: string,
    }
    struct Outer {
      #[deep]
      maybeInner?: Inner,
    }
  `);
  expect(ts).toContain("if (data.maybeInner !== undefined) {");
  expect(ts).toContain("Inner.tryNew(data.maybeInner)");
});

test("throwing new and Result-returning tryNew coexist", async () => {
  const { ts } = await transpile(`
    struct Foo {
      #[minimum(0)]
      count: number,
    }
  `);
  expect(ts).toContain('throw new Error("count must be a number")');
  expect(ts).toContain('return Err({ field: "count", message: "count must be a number" })');
});
