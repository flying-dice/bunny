import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { inlayHintsFor, InlayHintKind, type DocState, type InlayHint } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

// LSP range that covers the whole document — every test uses the same
// "give me all hints" envelope so the assertions stay focused on the
// algorithm rather than range arithmetic.
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

test("emits `data:` before the argument of a struct .new call", async () => {
  const source = `struct Product { id: string }

function build() -> Product {
  return Product.new({ id = "x" })
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const params = hints.filter((h) => h.kind === InlayHintKind.Parameter);
  expect(params).toHaveLength(1);
  expect(labelText(params[0]!)).toBe("data:");
  expect(params[0]!.paddingRight).toBe(true);

  // Hint anchored to the opening `{` of the argument — the first
  // non-whitespace character inside the parens of `Product.new(…)`.
  const braceCol = source.split("\n")[3]!.indexOf("{");
  expect(params[0]!.position.line).toBe(3);
  expect(params[0]!.position.character).toBe(braceCol);
});

test("emits one parameter-name hint per argument of a multi-arg fn call", async () => {
  const source = `fn clamp(value: number, low: number, high: number): number {
  return value
}

function use(): number {
  return clamp(5, 0, 10)
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  const callHints = hints
    .filter((h) => h.kind === InlayHintKind.Parameter)
    .filter((h) => ["value:", "low:", "high:"].includes(labelText(h)));
  expect(callHints.map(labelText)).toEqual(["value:", "low:", "high:"]);
  // All three hints sit on the same line (the `clamp(…)` call).
  const callLine = source.split("\n").findIndex((line) => line.includes("clamp(5"));
  for (const h of callHints) expect(h.position.line).toBe(callLine);
});

test("returns no hints for a call to an unknown function", async () => {
  const source = `fn use(): number {
  return mystery(1, 2)
}
`;
  const d = await doc(source);
  const hints = inlayHintsFor(d, fullRange(source), new Map());
  // No declaration of `mystery` anywhere — stay silent.
  expect(hints).toEqual([]);
});
