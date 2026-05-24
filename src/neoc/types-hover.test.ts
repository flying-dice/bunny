/**
 * Hover-level integration of the inference engine. Pins that when the
 * cursor sits on an identifier inside a function or impl-method body,
 * the hover popup ends with a `**: Type**` markdown line drawn from
 * `inferBody`.
 *
 * Existing hover behaviour (signature / doc comments for declarations
 * under the cursor) stays untouched — the type line is appended.
 */

import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { hoverAt, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

function positionOf(
  source: string,
  snippet: string,
  occurrence = 0,
): { line: number; character: number } {
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    const at = source.indexOf(snippet, from);
    if (at < 0) throw new Error(`snippet "${snippet}" #${occurrence} not in source`);
    if (i === occurrence) {
      let line = 0;
      let lastNl = -1;
      for (let j = 0; j < at; j++) {
        if (source.charCodeAt(j) === 10) {
          line++;
          lastNl = j;
        }
      }
      return { line, character: at - lastNl - 1 };
    }
    from = at + snippet.length;
  }
  throw new Error("unreachable");
}

function hoverValue(h: ReturnType<typeof hoverAt>): string {
  expect(h).not.toBeNull();
  return h!.contents.value;
}

test("hover on a let-bound number identifier appends the inferred type", async () => {
  const source = `fn f() -> number {
  let x = 42;
  return x;
}
`;
  const d = await doc(source);
  // Position on the `x` of `return x;`.
  const pos = positionOf(source, "x;");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain(": number");
});

test("hover on a struct constructor result shows the struct type", async () => {
  const source = `struct Product { id: string, name: string }
fn make() -> Product {
  let p = Product.new({ id: "1", name: "n" });
  return p;
}
`;
  const d = await doc(source);
  // The `p` on the `return p;` line — its inferred type is Product.
  const pos = positionOf(source, "p;");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain(": Product");
});

test("hover on a struct field access surfaces the field type", async () => {
  const source = `struct Product { id: string, name: string }
fn label(p: Product) -> string {
  return p.name;
}
`;
  const d = await doc(source);
  // Position on the `name` of `p.name`.
  const pos = positionOf(source, "name;");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain(": string");
});

test("hover on an unbound identifier reports the unknown reason", async () => {
  const source = `fn f() -> number {
  return ghost;
}
`;
  const d = await doc(source);
  const pos = positionOf(source, "ghost");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain("unknown<unbound: ghost>");
});

test("hover on a struct declaration still shows the signature plus the type line is absent outside bodies", async () => {
  const source = `struct Product { id: string, name: string }
`;
  const d = await doc(source);
  // Cursor on the `Product` keyword in the declaration. Outside any
  // function body — the inference line should NOT appear, but the
  // signature line should still render.
  const pos = positionOf(source, "Product");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain("struct Product");
  expect(md).not.toContain(": Product\n");
});

test("hover inside an impl-method body resolves a parameter's type", async () => {
  const source = `struct Counter { n: number }
impl Counter {
  show(self: Counter) -> number {
    return self.n;
  }
}
`;
  const d = await doc(source);
  // Position on the `n` of `self.n`.
  const pos = positionOf(source, "n;");
  const md = hoverValue(hoverAt(d, pos, new Map()));
  expect(md).toContain(": number");
});
