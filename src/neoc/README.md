# `src/neoc/` — language architecture

The neoc compiler splits into four modules with clean boundaries.

```
zed/tree-sitter-neoc/             1. grammar (editor + tooling)
src/neoc/ast/                     2. AST — typed node definitions
src/neoc/parser/                  3. source text → AST
src/neoc/codegen/lua/             4. AST → Lua 5.4
src/neoc/macros/                  macro system, owned by codegen
src/neoc/compiler.ts              orchestrator (parse → macros → codegen)
src/neoc/driver.ts                fs entry points (compileFile, buildProject)
src/neoc/lsp.ts                   stdio language server
```

## Module boundaries

**`ast/`** owns the AST type definitions. No logic, no string manipulation — just shapes. The `Module` / `ModulePart` model carries method / function bodies as opaque Lua text. The codegen weaves macro output and match lowerings into those bodies; the user writes plain Lua in the gaps.

**`parser/`** turns source text into AST via tree-sitter. Knows nothing about codegen. The same parser drives the codegen, the LSP, and future analysers.

**`codegen/lua/`** consumes an AST and produces Lua source. The macro system (`macros/`) registers emitters that produce Lua snippets the codegen weaves into the right slot (struct factory body, impl method block, module top level).

**`macros/`** holds the registry + built-in macros. Macros emit Lua snippets the codegen weaves into its output. Built-in derives (`Clone`, `Equals`, `ToTable`, `Display`) attach functions to the target struct's table; built-in field constraints (`minLength`, `maxLength`, `minimum`, `maximum`, `pattern`) emit runtime guards in `.new`. Function-attribute macros are slot-only today — the bundled set is empty.

## Importing the modules

The package exposes each layer separately:

```ts
import * as ast from "@flying-dice/neoc-compiler/ast";
import { parse } from "@flying-dice/neoc-compiler/parser";
import { emit } from "@flying-dice/neoc-compiler/codegen-lua";
import { transpile } from "@flying-dice/neoc-compiler/compiler";
import type { Macro } from "@flying-dice/neoc-compiler/macro";
```

## Adding a custom macro

A user macro is a TypeScript module exporting one or more `Macro` objects:

```ts
import type { FieldConstraintMacro } from "@flying-dice/neoc-compiler/macro";

export const isUuid: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "uuid",
  emit(_ctx, { struct, field }) {
    return [
      `if not string.match(data.${field.name}, "^[0-9a-f-]+$") then error("${struct.name}.${field.name}: not a uuid") end`,
    ];
  },
};
```

Run the compiler with `--macros ./macros/uuid.ts`; every macro the module exports gets registered alongside the built-ins.
