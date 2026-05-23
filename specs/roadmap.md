# Roadmap

## Identity

neoc is a **sibling dialect** of TypeScript, not a superset. It compiles to TS. Files interop via `import` — a `.neoc` file imports `.ts` files freely, and vice versa.

The grammar deliberately covers a smaller surface than TS. Forking `tree-sitter-typescript` would be permanent upstream-tracking work; trying to be a true superset is impossible without owning the TypeScript compiler itself (only Microsoft does, which is how TSX works — JSX is baked into `tsc`, not bolted on).

So neoc owns a **deliberate declaration surface** — `struct`, `impl`, `trait`, `match`, `#[…]`, `Self` — and stops there. Anything that already has a TypeScript form (generics, conditional types, mapped types, classes, decorators, arrow functions, destructuring, modules, …) is reached by writing a `.ts` file and importing it. The bar for any new neoc keyword is:

> **Could the user just write this in a `.ts` file?** If yes, it doesn't belong in the grammar.

## What's missing — new productions for neoc

These additions carry weight TS can't express. Each entry is sized to one future spec pair (`<feature>.md` + `ide-<feature>.md`).

### Errors & control flow

- **`?` operator on `Result`** — propagate the `Err` variant without an explicit match. neoc-only.
- **Pattern guards in `match`** — `Foo { x } if x > 0 => …`. Additive grammar extension on `match`.
- **Exhaustiveness checking on `match`** — compile-time diagnostic when a struct union or boolean discriminant isn't fully covered. Today the runtime throws `match: no arm matched`.

### Expressions

- **Range expressions** — `0..n`, `0..=n`, `a..b`. neoc-only sugar that lowers to a number-range iterator.
- **Operator overloading via trait impls** — `impl Add for Money` driving `+`, `==`, `<`. neoc-only; depends on `match` and trait dispatch existing first.
- **Block expressions** — `{ … final-expr }` that itself yields a value. Lowers to an IIFE.

### Type system

- **Associated types on traits** — `trait Iterator { type Item; … }` and `impl Iterator for Foo { type Item = Bar; }`. neoc-only.
- **Newtype shorthand** — `struct ProductId(string)` desugars to a one-field struct with `.value` access. Today every newtype is the explicit longhand.

### Macros

- **Custom user macros** — extension point so projects can register their own derive / field-constraint / function-attribute macros. Today the registry is closed and `builtins.ts` is the only source.

### Tooling

- **`#[test]` and `neoc test`** — `#[test]` attribute on an exported function; `neoc test` discovers them and runs through Bun's runner.
- **`#[bench]` and `neoc bench`** — same shape, benchmark variant.
- **Doctest blocks** — fenced code in `///` doc comments executed by the test runner.
- **`neoc doc`** — static-site documentation generator that consumes `///` doc comments.

## Editor (Zed) backlog

Features the LSP doesn't yet surface for `.neoc` files. The TypeScript Language Server already covers these for `.ts` files; the neoc LSP needs its own implementation for the declarations and expressions it owns.

- **Find references** — workspace-wide reference search on any neoc symbol.
- **Rename symbol** — coordinated rename across the workspace.
- **Workspace symbol search** — `cmd-T` style search across all declarations.
- **Signature help** — parameter hint popup inside a function or method call.
- **Code lens** — inline hints (run / test / # references) above declarations.
- **Format on save** — `neoc fmt` wired through `textDocument/formatting`.
- **Outline / structure view** — a panel listing every struct / trait / impl / function in the file.
- **Inlay hints** — inferred types shown inline at let bindings and method returns.
