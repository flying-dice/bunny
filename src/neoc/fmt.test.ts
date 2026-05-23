import { expect, test } from "bun:test";
import { formatSource } from "./fmt.ts";

test("normalises tab indentation to two spaces", () => {
  const input = "struct Point {\n\tx: number,\n\ty: number,\n}\n";
  const out = formatSource(input);
  expect(out).toBe("struct Point {\n  x: number,\n  y: number,\n}\n");
});

test("strips trailing whitespace from every line", () => {
  const input = "struct Point {   \n  x: number,\t\n  y: number,  \n}\n";
  const out = formatSource(input);
  expect(out).toBe("struct Point {\n  x: number,\n  y: number,\n}\n");
});

test("collapses runs of blank lines between top-level declarations to one", () => {
  const input = "struct A {}\n\n\n\nstruct B {}\n";
  const out = formatSource(input);
  expect(out).toBe("struct A {}\n\nstruct B {}\n");
});

test("ensures exactly one trailing newline", () => {
  const noNewline = formatSource("struct A {}");
  expect(noNewline).toBe("struct A {}\n");
  const manyNewlines = formatSource("struct A {}\n\n\n");
  expect(manyNewlines).toBe("struct A {}\n");
});

test("normalises derive comma spacing", () => {
  const input = "#[derive(Clone,Equals,ToTable)]\nstruct X {}\n";
  const out = formatSource(input);
  expect(out).toBe("#[derive(Clone, Equals, ToTable)]\nstruct X {}\n");
});

test("derive normalisation also handles already-spaced and mixed-spaced lists", () => {
  const input = "#[derive(Clone,  Equals ,ToTable)]\nstruct X {}\n";
  const out = formatSource(input);
  expect(out).toBe("#[derive(Clone, Equals, ToTable)]\nstruct X {}\n");
});

test("formatSource is idempotent", () => {
  const input = "#[derive(Clone,Equals)]\nstruct A {\n\tx: number,\n}\n\n\nstruct B {}\n";
  const once = formatSource(input);
  const twice = formatSource(once);
  expect(twice).toBe(once);
});
