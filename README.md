# neoc-compiler

A Rust-flavoured source language for scripting runtimes. **Lua 5.4 is the first target**; the language surface and codegen are decoupled so other targets can plug in.

neoc adds `struct`, `impl`, `trait`, `match`, and `#[macro]` attributes on top of a Rust-flavoured body grammar — `let`, `if`, `for`, `while`, `break`, `continue`, `return`, the `?` operator, template strings, ternaries. The compiler emits one target file per `.neoc` source. The first-party Lua runtime that consumes the output — [neoc](https://github.com/flying-dice/neoc) — is a separate Rust + mlua project; nothing in this repo depends on it.

## Install

```
bun add -d @flying-dice/neoc-compiler
```

This package is a TypeScript-authored compiler that targets Lua. It runs on Bun. You only need it as a dev dependency — your runtime has zero dependency on this package after codegen.

## Quick taste

```neoc
/// A point on a 2D plane.
#[derive(Clone, Equals, ToTable, Display)]
struct Point {
  x: number,
  y: number,
}

impl Point {
  translate(self: Point, dx: number, dy: number): Point {
    return Point.new({ x = self.x + dx, y = self.y + dy })
  }
}

struct DivByZero {}
struct UnknownOp { op: string }

export function apply(a: number, op: string, b: number): Result<number, DivByZero | UnknownOp> {
  return match op {
    "+" => Ok(a + b),
    "-" => Ok(a - b),
    "*" => Ok(a * b),
    "/" => (b == 0) and Err(DivByZero.new({})) or Ok(a / b),
    _ => Err(UnknownOp.new({ op = op })),
  }
}
```

Compiles to (excerpt):

```lua
-- neoc Result prelude
local function Ok(value) return { ok = true, value = value } end
local function Err(error) return { ok = false, error = error } end

local Point = {}
Point.__index = Point
function Point.new(data)
  data._struct = "Point"
  setmetatable(data, Point)
  return data
end

function Point.translate(self, dx, dy)
  return Point.new({ x = self.x + dx, y = self.y + dy })
end
function Point.clone(self) ... end
function Point.equals(a, b) ... end
function Point.toTable(self) ... end
function Point.display(self) ... end

function apply(a, op, b)
  return (function(__m)
    if __m == "+" then return Ok(a + b) end
    if __m == "-" then return Ok(a - b) end
    if __m == "*" then return Ok(a * b) end
    if __m == "/" then return (b == 0) and Err(DivByZero.new({})) or Ok(a / b) end
    return Err(UnknownOp.new({ op = op }))
  end)(op)
end
```

Runs unchanged through `luau` or stock Lua 5.4.

## Build

```
neoc build -s '**/*.neoc'
```

Writes one `.lua` next to each `.neoc`. Use `-w` for watch mode.

## Editor support

- **Zed** — extension in `zed/`. Run `cd zed && ./setup-grammar.sh && zed --install-dev-extension .` for a local dev install.
- **WebStorm / IntelliJ** — plugin in `intellij/`. Build with `cd intellij && ./gradlew buildPlugin`, then install the zip from `build/distributions/`.

Both surface highlighting, hover, completion, goto-definition, diagnostics, and a quick-fix that stubs missing trait methods.

## Author macros

The macro registry has three slots:

- **Derive macros** — `#[derive(Clone, Equals, …)]` on a struct. Each derived name resolves to a registered macro that emits a Lua function attached to the struct's table.
- **Field-constraint macros** — `#[minLength(1)]` etc. on a struct field. Emit Lua runtime guards that get woven into the struct's `.new` factory.
- **Function-attribute macros** — `#[attr]` on a function declaration. Reserved for future use; the bundled set ships empty (route-verb / sql / command macros from the prior TS-targeting era were dropped).

A custom macro is a plain TypeScript module exporting one or more `Macro` objects:

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

Pass it to `neoc build --macros ./macros/uuid.ts`. The compiler loads the module dynamically and registers every macro it exports.

## What the language deliberately doesn't have

neoc-script is a **sibling dialect** of Lua, not a superset. The grammar covers a deliberate declaration surface — `struct`, `impl`, `trait`, `match`, `#[…]`, `Self` — and stops there. Anything that already has a Lua form (tables, functions, control flow, modules) is written in Lua directly inside method bodies and the gaps between declarations.

The grammar tolerates expressions in bodies as opaque text. Inside `{ … }` and between declarations, the user is writing Lua. The compiler doesn't try to translate JS-flavoured operators (`===`, `&&`, `||`) into Lua equivalents — write `==`, `and`, `or` yourself.

See [specs/](specs/) for the full feature list and [specs/roadmap.md](specs/roadmap.md) for what isn't built yet.

## Repository layout

```
src/neoc/
├── ast/                       # generated typed AST + index
├── codegen/
│   └── lua/index.ts          # the only codegen target
├── macros/
│   ├── api.ts                 # public types for macro authors
│   ├── builtins.ts            # Clone, Equals, ToTable, Display, …
│   └── registry.ts            # registration + lookup
├── parser/
│   ├── adapter.ts             # tree-sitter walker → typed AST
│   ├── lower-match.ts         # match expression → Lua IIFE
│   ├── tree-sitter.ts         # WASM loader
│   └── index.ts
├── compiler.ts                # transpile(source) → { lua, diagnostics }
├── driver.ts                  # CLI build orchestrator
└── lsp.ts                     # stdio language server

zed/                           # Zed extension + tree-sitter grammar
intellij/                      # WebStorm / IDEA plugin
specs/                         # BDD-style language specs
examples/                      # showcase.neoc
```

## Licence

MIT.
