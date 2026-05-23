import { expect, test } from "bun:test";
import { parse } from "./parser/index.ts";
import { codeLensesFor, type CodeLens, type DocState } from "./lsp.ts";

async function doc(source: string): Promise<DocState> {
  const { module } = await parse(source);
  return { text: source, module };
}

function titleOf(lens: CodeLens): string {
  return lens.command?.title ?? "";
}

test("emits a Run test lens above a #[test] function", async () => {
  const source = `#[test]
function it_works(): void {
}
`;
  const d = await doc(source);
  const lenses = await codeLensesFor(d, "file:///a.neoc", []);
  const runLens = lenses.find((l) => titleOf(l).includes("Run test"));
  expect(runLens).toBeDefined();
  expect(runLens!.command!.command).toBe("neoc.runTest");
  expect(runLens!.command!.arguments).toEqual(["it_works"]);
});

test("emits an N references lens with the right count above a struct", async () => {
  // Three textual occurrences of `Product`: the declaration plus two
  // type references in the function bodies.
  const source = `struct Product { id: string }

function takes(p: Product): Product {
  return p
}
`;
  const d = await doc(source);
  const lenses = await codeLensesFor(d, "file:///a.neoc", []);
  const refLens = lenses.find(
    (l) => titleOf(l).endsWith("references") || titleOf(l).endsWith("reference"),
  );
  expect(refLens).toBeDefined();
  expect(refLens!.command!.command).toBe("neoc.showReferences");
  expect(titleOf(refLens!)).toBe("2 references");
});

test("a function with no #[test] and no references gets a single 0 references lens", async () => {
  const source = `function lonely(): void {
}
`;
  const d = await doc(source);
  const lenses = await codeLensesFor(d, "file:///a.neoc", []);
  expect(lenses).toHaveLength(1);
  expect(lenses[0]!.command!.command).toBe("neoc.showReferences");
  expect(titleOf(lenses[0]!)).toBe("0 references");
});
