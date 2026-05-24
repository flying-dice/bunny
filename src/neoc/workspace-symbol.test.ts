import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  workspaceSymbolsFor,
  SymbolKind,
  type LspWorkspaceSymbol,
} from "./lsp.ts";

// The workspace-symbol index is built off `harvestSymbols`, which is
// not exported. Drive it through the `_test_harvest` shim re-exposed by
// `lsp.ts`. To keep the test self-contained we mirror the harvest path
// by writing files into a temp dir and parsing each one ourselves.
import { parse } from "./parser/index.ts";

interface HarvestedSymbol {
  name: string;
  kind: "struct" | "trait" | "function" | "impl";
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  detail: string;
  traitName?: string;
}

async function harvest(uri: string, text: string, out: Map<string, HarvestedSymbol>): Promise<void> {
  const { module } = await parse(text);
  if (!module) return;
  for (const part of module.parts) {
    if (part.kind === "opaque") continue;
    const traitName = part.kind === "impl" ? part.traitName : undefined;
    out.set(`${part.kind}:${part.name}`, {
      name: part.name,
      kind: part.kind,
      uri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      detail: "",
      traitName,
    });
  }
}

async function buildWorkspace(files: Record<string, string>): Promise<Map<string, HarvestedSymbol>> {
  const root = mkdtempSync(join(tmpdir(), "neoc-ws-symbol-"));
  const out = new Map<string, HarvestedSymbol>();
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, text);
      await harvest(pathToFileURL(abs).href, text, out);
    }
    return out;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function names(syms: LspWorkspaceSymbol[]): string[] {
  return syms.map((s) => s.name);
}

test("query matches by case-insensitive substring on name", async () => {
  const ws = await buildWorkspace({
    "Product.neoc": `struct Product { id: string }`,
    "Order.neoc": `struct Order { id: string }`,
  });
  // Cast through `unknown` because the fn consumes the internal
  // `WorkspaceSymbol` shape — we only populate the fields it reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hit = workspaceSymbolsFor("Prod", ws as any);
  expect(names(hit)).toEqual(["Product"]);
});

test("matching is case-insensitive", async () => {
  const ws = await buildWorkspace({
    "Product.neoc": `struct Product { id: string }`,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(names(workspaceSymbolsFor("prod", ws as any))).toEqual(["Product"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(names(workspaceSymbolsFor("DUCT", ws as any))).toEqual(["Product"]);
});

test("empty query returns every harvested symbol", async () => {
  const ws = await buildWorkspace({
    "Product.neoc": `
      struct Product { id: string }
      fn greet(name: string) -> string { return "hi" }
    `,
    "Display.neoc": `
      trait Display { display(self: Self) -> string; }
    `,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = workspaceSymbolsFor("", ws as any);
  expect(names(all).sort()).toEqual(["Display", "Product", "greet"]);
});

test("symbol kinds map to LSP SymbolKind integers", async () => {
  const ws = await buildWorkspace({
    "all.neoc": `
      struct Product { id: string }
      trait Display { display(self: Self) -> string; }
      fn greet(name: string) -> string { return "hi" }
      impl Product { do(self: Product) -> void { } }
    `,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syms = workspaceSymbolsFor("", ws as any);
  const byName = new Map(syms.map((s) => [s.name, s]));
  // Product collides — both struct and impl share the name, so look up
  // by kind on each entry rather than asserting unique mapping.
  expect(syms.find((s) => s.name === "Product" && s.kind === SymbolKind.Struct)).toBeDefined();
  expect(syms.find((s) => s.name === "Product" && s.kind === SymbolKind.Class)).toBeDefined();
  expect(byName.get("Display")!.kind).toBe(SymbolKind.Interface);
  expect(byName.get("greet")!.kind).toBe(SymbolKind.Function);
});

test("trait impl entries carry the trait name as containerName", async () => {
  const ws = await buildWorkspace({
    "point.neoc": `
      trait Display { display(self: Self) -> string; }
      struct Point { x: number, y: number }
      impl Display for Point {
        display(self: Point) -> string { return "p" }
      }
    `,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syms = workspaceSymbolsFor("Point", ws as any);
  const impl = syms.find((s) => s.kind === SymbolKind.Class);
  expect(impl).toBeDefined();
  expect(impl!.name).toBe("Point");
  expect(impl!.containerName).toBe("Display");
  const structEntry = syms.find((s) => s.kind === SymbolKind.Struct);
  expect(structEntry!.containerName).toBeUndefined();
});

test("inherent impls leave containerName undefined", async () => {
  const ws = await buildWorkspace({
    "counter.neoc": `
      struct Counter { n: number }
      impl Counter { tick(self: Counter) -> void { } }
    `,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const impl = workspaceSymbolsFor("", ws as any).find((s) => s.kind === SymbolKind.Class)!;
  expect(impl.name).toBe("Counter");
  expect(impl.containerName).toBeUndefined();
});
