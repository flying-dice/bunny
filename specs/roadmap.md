# Roadmap

Features common to major statically-typed languages that tsb does **not** yet support.

tsb is a TypeScript dialect — whenever the feature already has a TypeScript surface, the spec sticks with **TS syntax** rather than inventing a Rust-style one. The work for those entries is awareness in the parser / LSP, not new grammar.

Each entry is sized to one future spec pair (`<feature>.md` + `ide-<feature>.md`).

## Already in TypeScript — needs tsb awareness only

These features parse today via the TypeScript inheritance, but the parser and LSP don't surface them as first-class concepts. The spec for each describes the existing TS form and what tsb needs to do to recognise it (completion, hover, goto, refactor).

- **Generic constraints** — `function f<T extends Foo>(x: T)`. The grammar accepts it; the LSP doesn't yet surface `T`'s bound in hover or completion. Use TS `extends`, not Rust `T: Trait`.
- **Parameterised type aliases** — `type Pair<T> = { left: T; right: T }`. Grammar accepts; LSP doesn't yet resolve `Pair<string>` to `{ left: string; right: string }` for completion / hover.
- **Closures** — arrow functions `(x, y) => x + y`. Already work. The LSP needs to treat them as first-class so signature help and parameter-type completion fire inside the body.
- **Destructuring in `let`** — `const { name, priceCents } = product`. Already parses; the LSP doesn't yet contribute the destructured names to local completion.
- **`use` / re-exports** — TS already covers this with `export * from "./x"`, `export { foo } from "./x"`. No new keyword. The LSP needs to follow re-exports when resolving symbols across files.
- **`mod`-style modules** — TS's file-is-a-module convention is the tsb convention. No new keyword. The LSP's workspace symbol index already follows it.
- **`Option<T>`** — TS expresses optionality as `T | undefined`. No new type. The LSP needs to teach completion / hover that `| undefined` is the canonical "absent" union.
- **String interpolation** — TS template literals `` `${a}-${b}` ``. Already work. No `format!` macro is needed.
- **Built-in test runner** — `bun test` is the runner. tsb test files use the same harness. The spec is for `bunny test` as a thin wrapper that resolves `.tsb` test files (and a `#[test]` attribute that names exported test functions, if we want one).

## New to tsb — needs both grammar and runtime

These have no TypeScript parallel. Each needs its own syntax decision, but where possible the syntax leans on JS / TS idiom rather than Rust.

### Type system

- **Visibility beyond `export`** — finer-grained `pub(module)` / `pub(crate)` style. Today every non-`export` declaration is module-local; everything `export`ed is public to the workspace. There is no in-between. Optional; many TS projects live without this.
- **Associated types on traits** — `trait Iterator { type Item; … }` and `impl Iterator for Foo { type Item = Bar; }`. No TypeScript parallel. Rust-style.
- **Newtype shorthand** — `struct ProductId(string)` desugars to a one-field struct with `.value` access. Today every newtype is the explicit longhand. Rust-style.

### Errors & control flow

- **`?` operator on `Result`** — propagate the `Err` variant without an explicit match. No TS parallel. Rust-style.
- **Pattern guards in `match`** — `Foo { x } if x > 0 => …`. TS has no `match`. tsb's `match` already exists; guards are an additive grammar extension.
- **Exhaustiveness checking on `match`** — compile-time error when a struct union or boolean discriminant isn't fully covered. Today the runtime throws `match: no arm matched`. The static check is tsb's responsibility; TS's `never` trick is what we already lean on for the discriminated-union pattern in plain TS code.
- **`if let` / `while let`** — pattern-binding conditional forms over a struct union. TS has type narrowing via `if (x.ok) { … }`; this is the pattern-using equivalent of that idiom. Optional — `match` covers the use case already.

### Expressions

- **Iterator / sequence protocol** — a tsb-blessed `Iterator` trait that drives `for x of seq`. TS has `Symbol.iterator`; the spec should re-use that protocol unchanged so JS iterables interop for free.
- **Range expressions** — `0..n`, `0..=n`, `a..b`. No TS parallel. Pure tsb sugar; lowers to a number-range iterator.
- **Operator overloading via trait impls** — `impl Add for Money` etc. driving `+`, `==`, `<`. TS / JS has no operator overloading. Rust-style, but only worth it if `match` + `Iterator` land first.
- **Block expressions** — a `{ … final-expr }` block that itself yields a value. TS doesn't have these. Lowers to an IIFE.

### Macros

- **Custom user macros** — extension-point so projects can register their own derive / field-constraint / function-attribute macros. Today the macro registry is closed and `builtins.ts` is the only source.

### Tooling

- **`#[test]` and `bunny test`** — `#[test]` attribute on an exported function; `bunny test` discovers them and runs through Bun's runner. The wrapper part is `bunny test`; the attribute is the new grammar bit.
- **`#[bench]` and `bunny bench`** — same shape, benchmark variant.
- **Doctest blocks** — fenced code in `///` doc comments executed by the test runner.
- **`bunny doc`** — static-site documentation generator that consumes `///` doc comments.

## Editor (Zed) backlog

- **Find references** — workspace-wide `goto-references` on any symbol. Today only `goto-definition` is wired.
- **Rename symbol** — coordinated rename across the workspace.
- **Workspace symbol search** — `cmd-T` style search across all declarations. Today only completion / hover use the index.
- **Signature help** — parameter hint popup inside a function call.
- **Code lens** — inline hints (run / test / # references) above declarations.
- **Format on save** — a `bunny fmt` formatter wired through the LSP `textDocument/formatting`.
- **Outline / structure view** — a panel listing every struct / trait / impl / function in the file.
- **Inlay hints** — inferred types shown inline at let bindings and method returns.
