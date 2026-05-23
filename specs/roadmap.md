# Roadmap

## Identity

neoc is a **sibling dialect** of Lua, not a superset. `.neoc` compiles to plain Lua 5.4. The grammar deliberately covers a smaller surface than full Lua — neoc owns a fixed declaration vocabulary (`struct`, `impl`, `trait`, `match`, `#[…]`, `Self`) and leaves everything else (expressions, statements, control flow inside method bodies) as opaque Lua text that the user writes directly.

The bar for any new neoc keyword is:

> **Could the user just write this in plain Lua?** If yes, it doesn't belong in the grammar.

This is the same architectural lesson as TSX → TS: don't reinvent the host language. TSX inherits TS's expression grammar because Microsoft maintains the JSX productions inside `tsc`. We can't do that for Lua, so the equivalent move is to keep our additions narrow and trust the user to write Lua inside method bodies.

## Implemented today

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

## What's missing — new productions for neoc

Each entry is sized to one future spec pair (`<feature>.md` + `ide-<feature>.md`).

### Errors & control flow

- **`?` operator on `Result`** — propagate the `Err` variant without an explicit match.
- **Pattern guards in `match`** — `Foo { x } if x > 0 => …`. Additive grammar extension.
- **Exhaustiveness checking on `match`** — compile-time diagnostic when a struct union or boolean discriminant isn't fully covered. Today the runtime relies on a fallback that throws.

### Expressions

- **Range expressions** — `0..n`, `0..=n`, `a..b`. Sugar that lowers to Lua's numeric `for` or a sequence iterator.
- **Operator overloading via trait impls** — `impl Add for Money` driving `+`, `==`, `<`. Lowers to Lua metatables (`__add`, `__eq`, `__lt`).
- **Block expressions** — `{ … final-expr }` that itself yields a value. Lowers to an IIFE.

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
