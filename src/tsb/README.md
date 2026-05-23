# `src/tsb/` — language architecture

The tsb language splits into four modules with clean boundaries.

```
zed/tree-sitter-tsb/             1. grammar (editor + tooling)
src/tsb/ast/                     2. AST — typed node definitions
src/tsb/parser/                  3. source text → AST
src/tsb/codegen/typescript/      4. AST → TypeScript
src/tsb/codegen/<future>/           AST → Go / Rust / Python / …
src/tsb/macros/                  macro system, shared across codegens
src/tsb/compiler.ts              orchestrator (parse → macros → codegen)
src/tsb/driver.ts                fs entry points (compileFile, buildProject)
src/tsb/lsp.ts                   stdio language server
```

## Module boundaries

**`ast/`** owns the AST type definitions. No logic, no string manipulation — just shapes. The current `Module` / `ModulePart` model has opaque text for method/function bodies. Cross-language codegens will require richer expression / statement nodes; the path forward is to extend these types and teach the parser to populate them. Today's AST is enough for TypeScript codegen because the body text passes through to the target almost verbatim (after match lowering + macro injection).

**`parser/`** turns source text into AST. Depends on `ast/` and its own `scanner.ts`. Knows nothing about codegen. The same parser drives every downstream consumer: codegens, the LSP, future analysers.

**`codegen/typescript/`** consumes an AST and produces TypeScript source. Self-contained — a new codegen lives as a sibling directory and consumes the same AST. The macro system (`macros/`) is shared between codegens, but each codegen decides what to do with macro output.

**`macros/`** holds the registry + built-in macros. Macros emit code snippets the codegen weaves into its output. The string-format of those snippets is target-specific today (built-in macros emit TypeScript), but the AST-level macro API in `macros/api.ts` is portable.

## Importing the modules

The package exposes each layer separately:

```ts
import * as ast from "@flying-dice/bunny/ast";
import { parse } from "@flying-dice/bunny/parser";
import { emit } from "@flying-dice/bunny/codegen-ts";
import { transpile } from "@flying-dice/bunny/compiler";
import type { Macro } from "@flying-dice/bunny/macro";
```

## Adding a new codegen target

1. Create `src/tsb/codegen/<target>/index.ts` exposing an `emit(module, registry, options): EmitResult` function.
2. Decide how macros translate. The built-in macros today emit TS snippets; for a new target you'd either re-implement them, or have macros emit a portable IR you translate.
3. Add a package export in `package.json` so consumers can `import { emit } from "@flying-dice/bunny/codegen-<target>";`.
4. Wire it into `compiler.ts` (or expose alongside the existing `transpile`) so the CLI / driver can pick the target.

The biggest gap before a non-JS target works is the opaque-text bodies — those need to become real AST nodes the new codegen can walk.
