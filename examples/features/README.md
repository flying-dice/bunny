# Feature illustrations

One `.neoc` source per language feature, each compiled to a sibling `.lua`. Rebuild any of them with:

```
cd examples/features
neoc build -s '<file>.neoc'
```

Or rebuild the whole set:

```
cd examples/features
neoc build -s '*.neoc'
```

## Index

| # | Feature | Source | Compiled |
| --- | --- | --- | --- |
| 01 | `struct` declaration | [01-struct.neoc](01-struct.neoc) | [01-struct.lua](01-struct.lua) |
| 02 | Newtype shorthand `struct Foo(T)` | [02-newtype.neoc](02-newtype.neoc) | [02-newtype.lua](02-newtype.lua) |
| 03 | Struct union via `type Foo = A \| B \| C` | [03-struct-union.neoc](03-struct-union.neoc) | [03-struct-union.lua](03-struct-union.lua) |
| 04 | Inherent `impl` block | [04-impl.neoc](04-impl.neoc) | [04-impl.lua](04-impl.lua) |
| 05 | `trait` + `impl Trait for Struct` | [05-trait.neoc](05-trait.neoc) | [05-trait.lua](05-trait.lua) |
| 06 | `Self` type | [06-self-type.neoc](06-self-type.neoc) | [06-self-type.lua](06-self-type.lua) |
| 07 | `match` expression with all pattern kinds | [07-match.neoc](07-match.neoc) | [07-match.lua](07-match.lua) |
| 08 | Pattern guards in `match` arms | [08-pattern-guard.neoc](08-pattern-guard.neoc) | [08-pattern-guard.lua](08-pattern-guard.lua) |
| 09 | Block expression `{ … final-expr }` | [09-block-expression.neoc](09-block-expression.neoc) | [09-block-expression.lua](09-block-expression.lua) |
| 10 | Range expressions `0..n` / `0..=n` | [10-range-expression.neoc](10-range-expression.neoc) | [10-range-expression.lua](10-range-expression.lua) |
| 11 | `Result<T, E>` with `Ok` / `Err` | [11-result.neoc](11-result.neoc) | [11-result.lua](11-result.lua) |
| 12 | `?` postfix operator on `Result` | [12-try-operator.neoc](12-try-operator.neoc) | [12-try-operator.lua](12-try-operator.lua) |
| 13 | `#[derive(Clone)]` | [13-derive-clone.neoc](13-derive-clone.neoc) | [13-derive-clone.lua](13-derive-clone.lua) |
| 14 | `#[derive(Equals)]` | [14-derive-equals.neoc](14-derive-equals.neoc) | [14-derive-equals.lua](14-derive-equals.lua) |
| 15 | `#[derive(ToTable)]` | [15-derive-to-table.neoc](15-derive-to-table.neoc) | [15-derive-to-table.lua](15-derive-to-table.lua) |
| 16 | `#[derive(Display)]` | [16-derive-display.neoc](16-derive-display.neoc) | [16-derive-display.lua](16-derive-display.lua) |
| 17 | Field-constraint macros | [17-field-constraints.neoc](17-field-constraints.neoc) | [17-field-constraints.lua](17-field-constraints.lua) |
| 18 | `#[test]` attribute | [18-test-attribute.neoc](18-test-attribute.neoc) | [18-test-attribute.lua](18-test-attribute.lua) |
| 19 | `///` and `/** */` doc comments | [19-doc-comments.neoc](19-doc-comments.neoc) | [19-doc-comments.lua](19-doc-comments.lua) |

The full language spec lives in [`specs/`](../../specs/). Each row in the table above has a matching `specs/<feature>.md` + `specs/ide-<feature>.md` pair.

## Tests for the generated Lua

Tests split along two axes — **shape** (does the codegen produce the right Lua?) and **runtime** (does the emitted Lua actually work?).

### Shape — Bun snapshots

Every feature has a sibling `XX-feature.test.ts` that calls `transpile()` on the `.neoc` source and snapshots the result with `expect(lua).toMatchSnapshot()`. Snapshots live under `__snapshots__/` and are checked into git. Any change to the codegen output diffs against the stored snapshot, and an intentional change is accepted via `bun test -u`.

```
bun test examples/features
```

### Runtime — Lua test driver

[`run-tests.lua`](run-tests.lua) loads each compiled `.lua` into the test scope and asserts the emitted construct actually behaves (struct factories stamp the brand, `match` returns the right arm, `Result` carries `ok`/`value`, derive macros work, field-constraint violations raise the documented error).

```
cd examples/features
lua run-tests.lua
```

[`runtime.test.ts`](runtime.test.ts) wraps that runner so `bun test` in the project root picks it up automatically — skips with a warning when `lua` isn't on PATH (`brew install lua`).
