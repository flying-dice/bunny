import { expect, test } from "bun:test";
import { tokenize } from "./parser/scanner.ts";

function roundTrip(src: string): void {
  const tokens = tokenize(src);
  const joined = tokens.map((t) => t.text).join("");
  expect(joined).toBe(src);
}

test("tokenizer is lossless on plain TS", () => {
  roundTrip(`import { Foo } from "./foo.ts";\n\nconst x = 42;\n`);
});

test("tokenizer handles template literals with substitutions", () => {
  roundTrip("const s = `hello ${name + `nested ${1 + 2}`}!`;\n");
});

test("tokenizer doesn't get confused by `/` in regex vs division", () => {
  roundTrip("const re = /[a-z]\\/.+/i;\nconst x = a / b / c;\n");
});

test("tokenizer recognises struct/impl/match identifiers", () => {
  const tokens = tokenize(`struct Foo { id: string; }\nimpl Foo {\n  new(d: Foo): Foo { return d; }\n}\n`);
  const idents = tokens.filter((t) => t.kind === "ident").map((t) => t.text);
  expect(idents).toContain("struct");
  expect(idents).toContain("impl");
  expect(idents).toContain("Foo");
  expect(idents).toContain("new");
  expect(idents).toContain("string");
});

test("tokenizer recognises #[ attribute opener", () => {
  const tokens = tokenize(`#[derive(Clone, Equals)]\nstruct Foo {}\n`);
  const attrOpen = tokens.find((t) => t.kind === "attr-open");
  expect(attrOpen).toBeDefined();
  expect(attrOpen?.text).toBe("#[");
});

test("tokenizer reproduces braces / commas / arrows", () => {
  const tokens = tokenize(`match x { 1 => "a", 2 => "b", _ => "z" }`);
  const kinds = tokens.map((t) => t.kind).filter((k) => k !== "ws");
  // expected sequence (without ws):
  // ident(match) ident(x) lbrace number arrow string comma number arrow string comma ident(_) arrow string rbrace
  expect(kinds).toEqual([
    "ident",
    "ident",
    "lbrace",
    "number",
    "arrow",
    "string",
    "comma",
    "number",
    "arrow",
    "string",
    "comma",
    "ident",
    "arrow",
    "string",
    "rbrace",
  ]);
});

test("tokenizer skips string contents — no false-positive braces", () => {
  // Without proper string handling, the `{` inside the string would be
  // counted as a real brace.
  const tokens = tokenize(`const s = "has a { brace and } another";\n`);
  const realBraces = tokens.filter((t) => t.kind === "lbrace" || t.kind === "rbrace");
  expect(realBraces.length).toBe(0);
});

test("tokenizer skips comment contents — no false-positive keywords", () => {
  const tokens = tokenize(`// struct is a keyword\nconst x = 1;\n`);
  const idents = tokens.filter((t) => t.kind === "ident").map((t) => t.text);
  expect(idents).not.toContain("struct"); // only inside the comment
  expect(idents).toContain("const");
  expect(idents).toContain("x");
});
