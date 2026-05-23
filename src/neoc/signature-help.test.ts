import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { signatureHelpAt, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

function positionAt(source: string, marker: string): { line: number; character: number } {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`marker "${marker}" not in source`);
  let line = 0;
  let lastNl = -1;
  for (let j = 0; j < at; j++) {
    if (source.charCodeAt(j) === 10) { line++; lastNl = j; }
  }
  return { line, character: at - lastNl - 1 };
}

const emptyWorkspace = new Map();

test("cursor inside foo(|) returns the signature with activeParameter 0", async () => {
  const source = `function add(a: number, b: number): number {
  return a + b
}

function caller(): number {
  return add()
}
`;
  const d = await doc(source);
  // Position the cursor between the parens of `add()`.
  const pos = positionAt(source, "add()");
  pos.character += "add(".length;
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).not.toBeNull();
  expect(help!.signatures).toHaveLength(1);
  expect(help!.signatures[0]!.label).toBe("add(a: number, b: number): number");
  expect(help!.signatures[0]!.parameters).toEqual([
    { label: "a: number" },
    { label: "b: number" },
  ]);
  expect(help!.activeParameter).toBe(0);
});

test("cursor after a comma foo(1, |) returns activeParameter 1", async () => {
  const source = `function add(a: number, b: number): number {
  return a + b
}

function caller(): number {
  return add(1, 2)
}
`;
  const d = await doc(source);
  const pos = positionAt(source, "add(1, 2)");
  pos.character += "add(1, ".length;
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).not.toBeNull();
  expect(help!.activeParameter).toBe(1);
  expect(help!.signatures[0]!.label).toBe("add(a: number, b: number): number");
});

test("cursor inside Product.new(|) returns the struct's .new signature", async () => {
  const source = `struct Product {
  id: string,
  name: string,
}

function build(): Product {
  return Product.new({ id: "1", name: "x" })
}
`;
  const d = await doc(source);
  const pos = positionAt(source, "Product.new({");
  pos.character += "Product.new(".length;
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).not.toBeNull();
  expect(help!.signatures[0]!.label).toBe("Product.new(data: Product): Product");
  expect(help!.signatures[0]!.parameters).toEqual([{ label: "data: Product" }]);
  expect(help!.activeParameter).toBe(0);
});

test("cursor outside any call returns null", async () => {
  const source = `function add(a: number, b: number): number {
  return a + b
}
`;
  const d = await doc(source);
  // Position cursor on the `function` keyword.
  const pos = positionAt(source, "function");
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).toBeNull();
});

test("nested calls report the innermost callee", async () => {
  const source = `function inner(x: number): number { return x }
function outer(a: number, b: number): number { return a + b }

function caller(): number {
  return outer(1, inner())
}
`;
  const d = await doc(source);
  const pos = positionAt(source, "inner())");
  pos.character += "inner(".length;
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).not.toBeNull();
  expect(help!.signatures[0]!.label).toBe("inner(x: number): number");
  expect(help!.activeParameter).toBe(0);
});

test("commas inside nested brackets don't bump activeParameter", async () => {
  const source = `function take(a: table, b: number): number { return b }

function caller(): number {
  return take({ x: 1, y: 2 }, 7)
}
`;
  const d = await doc(source);
  // Cursor just before `7` — should be parameter index 1, not higher.
  const pos = positionAt(source, ", 7)");
  pos.character += ", ".length;
  const help = signatureHelpAt(d, pos, emptyWorkspace);
  expect(help).not.toBeNull();
  expect(help!.activeParameter).toBe(1);
});
