import { expect, test } from "bun:test";
import { transpile } from "./compiler.ts";

test("bare `_ if cond =>` lowers to a conditional return", async () => {
  const { lua } = await transpile(`
    pub fn classify(n: number): string {
      return match n {
        _ if n > 0 => "positive",
        _ if n < 0 => "negative",
        _ => "zero",
      }
    }
  `);
  expect(lua).toContain('if n > 0 then return "positive" end');
  expect(lua).toContain('if n < 0 then return "negative" end');
  expect(lua).toContain('return "zero"');
  // A guarded wildcard isn't a catch-all on its own, but the final
  // unguarded `_` arm is — so no error fallback.
  expect(lua).not.toContain('error("match: no arm matched")');
});

test("struct-pattern guard runs after the binds are in scope", async () => {
  const { lua } = await transpile(`
    struct Number { n: number }
    pub fn describe(value: Number): string {
      return match value {
        Number { n } if n > 0 => "positive",
        Number { n } if n < 0 => "negative",
        Number { n } => "zero",
      }
    }
  `);
  // Bind happens inside the struct branch, then the guard gates the
  // return — so a failing guard falls through to the next arm.
  expect(lua).toContain(
    'if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; if n > 0 then return "positive" end end'
  );
  expect(lua).toContain(
    'if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; if n < 0 then return "negative" end end'
  );
  expect(lua).toContain(
    'if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; return "zero" end'
  );
});

test("a guarded catch-all does not suppress the error fallback", async () => {
  const { lua } = await transpile(`
    pub fn f(x: number): string {
      return match x {
        1 => "one",
        _ if x > 10 => "big",
      }
    }
  `);
  // Only arms here are a literal (which can miss) and a guarded
  // wildcard (whose guard can fail), so the runtime fallback must
  // still emit.
  expect(lua).toContain('if __m == 1 then return "one" end');
  expect(lua).toContain('if x > 10 then return "big" end');
  expect(lua).toContain('error("match: no arm matched")');
});
