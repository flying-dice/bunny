import { expect, test } from "bun:test";
import { transpile } from "./transpile.ts";

test("match binds object-pattern fields into the arm scope", async () => {
  const { ts } = await transpile(`
    type R = { ok: true; value: number } | { ok: false; error: string };
    export function f(r: R): string {
      return match r {
        { ok: true, value: v } => \`ok: \${v}\`,
        { ok: false, error: e } => \`err: \${e}\`,
        _ => "?",
      };
    }
  `);
  expect(ts).toContain("const v = (__m as any).value");
  expect(ts).toContain("const e = (__m as any).error");
  expect(ts).toContain("(__m as Record<string, unknown>).ok === true");
});

test("match supports boolean discriminants and binding side-by-side", async () => {
  const { ts } = await transpile(`
    export function f(r: { ok: true } | { ok: false }): boolean {
      return match r {
        { ok: true } => true,
        { ok: false } => false,
      };
    }
  `);
  expect(ts).toContain("(__m as Record<string, unknown>).ok === true");
  expect(ts).toContain("(__m as Record<string, unknown>).ok === false");
});

test("{ field } shorthand binds a same-named local in the arm body", async () => {
  const { ts } = await transpile(`
    type E = { kind: "Hit"; value: number } | { kind: "Miss" };
    export function f(e: E): number {
      return match e {
        { kind: "Hit", value } => value,
        { kind: "Miss" } => 0,
      };
    }
  `);
  expect(ts).toContain('(__m as Record<string, unknown>).kind === "Hit"');
  expect(ts).toContain("const value = (__m as any).value");
});

test("match expressions in opaque (non-attribute) functions get lowered", async () => {
  const { ts } = await transpile(`
    export function classify(n: number): string {
      return match n {
        0 => "zero",
        _ => "other",
      };
    }
  `);
  // The IIFE structure indicates lowering happened.
  expect(ts).toContain("((__m) => {");
  expect(ts).toContain('if (__m === 0) return "zero"');
});

test("trait declaration emits a generic TS interface", async () => {
  const { ts } = await transpile(`
    trait Display {
      fmt(self: Self): string;
    }
  `);
  expect(ts).toContain("export interface Display<Self>");
  expect(ts).toContain("fmt(self: Self): string;");
});

test("impl Trait for Foo emits a satisfies-style const assignment", async () => {
  const { ts } = await transpile(`
    trait Display {
      fmt(self: Self): string;
    }
    struct Foo { name: string }
    impl Display for Foo {
      fmt(self: Foo): string { return self.name; }
    }
  `);
  expect(ts).toContain("const __Foo_satisfies_0: Display<Foo> = Foo");
});

test("default trait methods inline on the target with Self substituted", async () => {
  const { ts } = await transpile(`
    trait Greeter {
      hi(self: Self): string {
        return Self.greeting(self);
      }
      greeting(self: Self): string;
    }
    struct Bot { id: string }
    impl Greeter for Bot {
      greeting(self: Bot): string { return "hi"; }
    }
  `);
  // The default \`hi\` method should land on Bot's const with Self replaced.
  expect(ts).toContain("hi(self: Bot): string");
  expect(ts).toContain("Bot.greeting(self)");
});

test("user-provided methods override defaults", async () => {
  const { ts } = await transpile(`
    trait Greeter {
      hi(self: Self): string { return "default"; }
    }
    struct Bot { id: string }
    impl Greeter for Bot {
      hi(self: Bot): string { return "custom"; }
    }
  `);
  expect(ts).toContain('return "custom"');
  expect(ts).not.toContain('return "default"');
});

test("multiple trait impls emit one satisfies check each", async () => {
  const { ts } = await transpile(`
    trait A { a(self: Self): void; }
    trait B { b(self: Self): void; }
    struct Foo { id: string }
    impl A for Foo { a(self: Foo): void {} }
    impl B for Foo { b(self: Foo): void {} }
  `);
  expect(ts).toContain("const __Foo_satisfies_0: A<Foo> = Foo");
  expect(ts).toContain("const __Foo_satisfies_1: B<Foo> = Foo");
});
