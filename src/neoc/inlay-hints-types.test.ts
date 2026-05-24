/**
 * Inferred-type inlay hints on `let` bindings. The walker already
 * computes the binding's type during `inferBody`; the LSP looks it up
 * by `startIndex` and renders a `: <type>` ghost label after the
 * identifier. Explicit annotations and `unknown` results stay silent.
 */
import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { inlayHintsFor, InlayHintKind, type DocState, type InlayHint } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

function fullRange(source: string): { start: { line: number; character: number }; end: { line: number; character: number } } {
  const lines = source.split("\n");
  return {
    start: { line: 0, character: 0 },
    end: { line: lines.length, character: 0 },
  };
}

function labelText(hint: InlayHint): string {
  return typeof hint.label === "string" ? hint.label : hint.label.map((p) => p.value).join("");
}

test("emits `: number` after a let binding initialised with a numeric literal", async () => {
  const source = `fn use() -> number {
  let x = 42
  return x
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const typeHints = hints.filter((h) => h.kind === InlayHintKind.Type);
  expect(typeHints).toHaveLength(1);
  expect(labelText(typeHints[0]!)).toBe(": number");
  expect(typeHints[0]!.paddingLeft).toBe(true);

  // Anchored to the column right after `x`.
  const letLine = source.split("\n").findIndex((l) => l.includes("let x"));
  const xCol = source.split("\n")[letLine]!.indexOf("x");
  expect(typeHints[0]!.position.line).toBe(letLine);
  expect(typeHints[0]!.position.character).toBe(xCol + 1);
});

test("emits no type hint when the let binding already carries an annotation", async () => {
  const source = `fn use() -> number {
  let x: number = 42
  return x
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const typeHints = hints.filter((h) => h.kind === InlayHintKind.Type);
  expect(typeHints).toEqual([]);
});

test("emits `: Product` after a let binding initialised by `Struct.new(...)`", async () => {
  const source = `struct Product { id: string }

fn build() -> Product {
  let p = Product.new({ id = "x" })
  return p
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const typeHints = hints.filter((h) => h.kind === InlayHintKind.Type);
  expect(typeHints).toHaveLength(1);
  expect(labelText(typeHints[0]!)).toBe(": Product");
  expect(typeHints[0]!.paddingLeft).toBe(true);
});

test("parameter-name hints still appear alongside let-type hints", async () => {
  const source = `fn add(a: number, b: number) -> number {
  return a + b
}

fn use() -> number {
  let sum = add(1, 2)
  return sum
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());

  const paramHints = hints
    .filter((h) => h.kind === InlayHintKind.Parameter)
    .map(labelText);
  expect(paramHints).toEqual(["a:", "b:"]);

  const typeHints = hints
    .filter((h) => h.kind === InlayHintKind.Type)
    .map(labelText);
  expect(typeHints).toEqual([": number"]);
});

test("stays silent when the inferred binding type is unknown", async () => {
  const source = `fn use() -> number {
  let mystery = noSuchValue
  return 0
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const typeHints = hints.filter((h) => h.kind === InlayHintKind.Type);
  expect(typeHints).toEqual([]);
});
