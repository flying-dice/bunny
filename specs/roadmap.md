# Roadmap

## Identity

neoc is a **Rust-flavoured source language** for scripting runtimes. The compiler owns the entire grammar — declarations, statements, expressions, and control flow — and emits target code through an AST-driven translator. Each target backend lives behind its own codegen module; the language surface is target-agnostic.

**Lua 5.4 is the first target.** Earlier drafts framed neoc as a thin Lua shell that delegated body syntax to Lua and treated function bodies as opaque text. That direction was abandoned: keeping inference, diagnostics, and editor tooling honest required a real body grammar, and tying the source surface to one target ruled out the others. Today the user writes neoc end-to-end (`let`, `if (…) { … }`, `||`, `for x in …`, `while (…)`, `break`, `continue`, struct / impl / trait / match …) and the active codegen produces the equivalent in whichever target dialect was selected.

The bar for any new neoc keyword is:

> **Does the construct earn its place in the AST?** A construct earns its place when it lets us provide a better diagnostic, a better inference rule, or a more natural Rust-flavoured spelling than a verbatim runtime token would. If none of those apply, prefer an `ext fn` over a new keyword.

Bodies are no longer opaque — there's no escape hatch back to raw target syntax inside a function body. Target-only primitives (Lua's `string` / `table` / `math`, a Python target's `print` / `len`, a JS target's `console.log`, host-specific APIs of any kind) reach the user through `ext fn` declarations, which are signature-only bindings the inference engine respects. The same `.neoc` source recompiles against a different target by swapping codegen modules and the matching `ext fn` set.

## Implemented today

The compiler's only shipping target is Lua 5.4. The "Lua output" column shows what each construct emits through the current codegen; a future target backend would substitute its own column.

| Construct | Lua output |
| --- | --- |
| `struct Foo { … }` | Lua table + metatable + `Foo.new(data)` factory |
| Field constraints (`#[minLength], …`) | Runtime guards inside `.new` |
| `#[derive(Clone, Equals, ToTable, Display)]` | Per-struct functions on the table |
| `impl Foo { … }` | `function Foo.<method>(self, …)` attachments |
| `impl Trait for Foo` | Method attachments + default-bodied inheritance with `Self` → target rewrite |
| `match scrutinee { … }` | IIFE `(function(__m) … end)(scrutinee)` with literal / binding / struct / object patterns |
| `Result<T, E>`, `Ok`, `Err` | Auto-prepended local prelude `{ ok = true, value = … }` / `{ ok = false, error = … }` |
| `///` and `/** */` doc comments | Pass through translated to `---` / `--[[ … ]]` |
| `import { … } from "./mod.neoc"` | `local __mod_xyz = require("./mod"); local Foo = __mod_xyz.Foo` |
| `let x: T = expr` / `const x = expr` | `local x = expr` (annotation is the type-check anchor; not emitted) |
| `if (cond) { … } else if (…) { … } else { … }` | `if cond then … elseif … then … else … end` |
| `for x in 0..n { … }` / `for x in arr { … }` | Numeric `for x = 0, n - 1` for ranges; `for _, x in ipairs(arr)` otherwise |
| `while (cond) { … }`, `break`, `continue` | `while cond do … end` (`continue` lowers via `goto continue` + label) |
| `arr[i]` | `arr[(i) + 1]` so 0-based access lines up with Lua's 1-based tables |
| `\`hello ${name}\`` template strings | `"hello " .. tostring(name)` concat |
| `null` / `undefined` | `nil` |
| `expr?` on a `Result` (statement or `let` position) | `local __r = …; if not __r.ok then return __r end; …` |

## What's missing — new productions for neoc

Each entry is sized to one future spec pair (`<feature>.md` + `ide-<feature>.md`).

### Errors & control flow

- **`?` operator on `Result`** — propagate the `Err` variant without an explicit match.
- **Pattern guards in `match`** — `Foo { x } if x > 0 => …`. Additive grammar extension.
- **Exhaustiveness checking on `match`** — compile-time diagnostic when a struct union or boolean discriminant isn't fully covered. Today the runtime relies on a fallback that throws.

### Expressions

- **Operator overloading via trait impls** — `impl Add for Money` driving `+`, `==`, `<`. Lowers to Lua metatables (`__add`, `__eq`, `__lt`).

### Statements

- **Length operator** — `arr.len()` or `len(arr)` mapping to Lua's `#arr`. Today users would have to declare it as an `ext fn` themselves.
- **Compound assignment fall-back** — `+=` / `-=` etc. parse today but emit verbatim, which Lua doesn't support. Either lower to `x = x + …` or remove from the grammar.

### Type system

- **Associated types on traits** — `trait Iterator { type Item; … }`. Lua-side these would be documentation only; the LSP would still surface them.
- **Newtype shorthand** — `struct ProductId(string)` desugars to a one-field struct with `.value` access.

### Macros

- **Custom user macros** — extension point so projects can register their own derive / field-constraint / function-attribute macros. The registry already supports loading by module path; needs a worked example and CLI flag plumbing.
- **Function-attribute macros** — the slot exists in the registry; the bundled set is empty. First useful citizens would be a `#[test]` attribute and a `#[mlua_export]` attribute for the host runtime.

### Tooling

- **`#[test]` and `neoc test`** — `#[test]` attribute on an exported function; `neoc test` discovers them and runs each through `luau` (or a configured Lua runner).
- **Doctest blocks** — fenced code in `///` doc comments executed by the test runner.
- **`neoc doc`** — static-site documentation generator that consumes `///` doc comments.

## Editor (Zed / IntelliJ) backlog

Features the LSP doesn't yet surface for `.neoc` files.

- **Find references** — workspace-wide reference search on any neoc symbol.
- **Rename symbol** — coordinated rename across the workspace.
- **Workspace symbol search** — `cmd-T` style search across all declarations.
- **Signature help** — parameter hint popup inside a function or method call.
- **Code lens** — inline hints (run / test / # references) above declarations.
- **Format on save** — `neoc fmt` wired through `textDocument/formatting`.
- **Outline / structure view** — a panel listing every struct / trait / impl / function in the file.
- **Inlay hints** — inferred types shown inline at let bindings and method returns.
