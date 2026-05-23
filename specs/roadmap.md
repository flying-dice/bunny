# Roadmap

Features common to major statically-typed languages (Rust, Swift, Kotlin, modern TypeScript, Scala) that tsb does **not** yet support. Each entry is sized to one future spec pair (`<feature>.md` + `ide-<feature>.md`).

Grouped by theme, ordered roughly by leverage — items near the top unlock the most downstream work.

## Type system

- **Visibility modifiers** — `pub` / module-private declarations. Today every `export`ed name is public; everything else is module-local. There's no fine-grained `pub(crate)`-style scoping.
- **Full generics** — generic parameters on `function`, `struct`, `trait`, and `impl` exist in the grammar, but there are no `T: Trait` constraints, no `where` clauses, no variance markers. Most real designs need at least bounded generics.
- **Associated types on traits** — `trait Iterator { type Item; … }` and the impl-time binding `impl Iterator for Foo { type Item = Bar; }`. Today only methods are trait-able.
- **Type aliases with arguments** — `type Pair<T> = { left: T; right: T }`. Today the alias keyword exists for unions; parameterised aliases aren't lowered.
- **Newtype structs** — tuple-struct shorthand `struct ProductId(string)` with `.value` access. Today every newtype requires a one-field struct.

## Errors & control flow

- **`if let` / `let else`** — pattern-binding conditional forms over `Result`, `Option`, and struct unions. Today the only pattern-matching form is `match`.
- **`?` operator on `Result`** — propagate the error variant without explicit match. Today every Result has to be matched by hand.
- **Pattern guards in `match`** — `case Foo { x } if x > 0 => …`. Today arms can't carry guard expressions.
- **`Option<T>`** — explicit `Option` type as a struct union (`Some<T>` | `None`). Today nullability uses TS `| undefined`.
- **Exhaustiveness checking on `match`** — compile-time error when a struct union isn't fully covered. Today the runtime throws `match: no arm matched`.

## Expressions

- **Closures with concise syntax** — `|x, y| x + y` or `(x, y) => x + y` as first-class values. Today arrow functions inherited from TS exist; we don't have a tsb-blessed shorthand.
- **Iterator / sequence trait** — a stdlib `Iterator` trait + `for x of seq` desugaring driving `.next()`. Today `for` is the TS for-of with no language-level abstraction.
- **Range expressions** — `0..n`, `0..=n`, `a..b`. Today these don't parse.
- **Operator overloading via trait impls** — `impl Add for Money` etc. driving `+`, `-`, `==`, `<`. Today operators are TS-native.
- **Block expressions** — a `{ … final-expr }` block that is itself an expression. Today blocks are statements only.

## Modules & bindings

- **`use` / re-exports** — pull names from another module without re-typing the path, or re-publish them. Today every import lists the names directly.
- **`mod`-style module declarations** — first-class module groupings beyond per-file. Today the module unit is the file.
- **`let` destructuring** — `let { name, priceCents } = product;`. Today destructuring works via inherited TS, but isn't part of the tsb grammar specifically and isn't surfaced by completion / hover.
- **`const` evaluation** — compile-time evaluation of `const` initialisers for use in attributes and type-level contexts. Today only literal arguments work in `#[…]`.

## Macros

- **Custom user macros** — extension-point so projects can register their own derive / field-constraint / function-attribute macros. Today the macro registry is closed and `builtins.ts` is the only source.
- **`format!` / `println!`-style macros** — interpolation macros that lower to template-literal calls with type-checked argument lists. Today string interpolation uses raw TS template literals.

## Tooling

- **Built-in test framework** — `#[test]` on a function, `bunny test` runner, assertion macros. Today tests live in `*.test.ts` using Bun's runner.
- **Built-in benchmark framework** — `#[bench]` on a function. Today there isn't one.
- **Doctest blocks** — fenced code in `///` doc comments executed by the test runner. Today doc bodies are pure prose.
- **Documentation generator** — `bunny doc` producing a static site from `///` doc comments. Today docs live in the LSP hover only.

## Editor (Zed) backlog

- **Find references** — workspace-wide `goto-references` on any symbol. Today only `goto-definition` is wired.
- **Rename symbol** — coordinated rename across the workspace. Today no rename.
- **Workspace symbols** — `cmd-T` style search across all declarations. Today only completion / hover use the index.
- **Signature help** — parameter hint popup inside a function call. Today no signature help.
- **Code lens** — inline hints (run / test / # references) above declarations. Today no lens.
- **Format on save** — a `bunny fmt` formatter wired through the LSP `textDocument/formatting`. Today there is no formatter.
- **Outline / structure view** — a panel listing every struct / trait / impl / function in the file. Today no outline.
- **Inlay hints** — inferred types shown inline at let bindings and method returns. Today no inlay hints.
