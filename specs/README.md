# neoc specs

Behaviour specifications for the neoc language and its editor support. Two files per feature:

- `<feature>.md` — semantics of the feature itself.
- `ide-<feature>.md` — what the editor should do for it (highlighting, completion, parsing, transpile, run).

Style: short, BDD-style **Given / When / Then** bullets, grouped into the relevant aspect of the feature.

## Language

| Feature | Language | IDE |
| --- | --- | --- |
| `struct` declarations | [struct.md](struct.md) | [ide-struct.md](ide-struct.md) |
| Newtype shorthand `struct Foo(T)` | [newtype.md](newtype.md) | [ide-newtype.md](ide-newtype.md) |
| `impl` blocks | [impl.md](impl.md) | [ide-impl.md](ide-impl.md) |
| `trait` declarations | [trait.md](trait.md) | [ide-trait.md](ide-trait.md) |
| `match` expressions | [match.md](match.md) | [ide-match.md](ide-match.md) |
| `if <expr>` pattern guards | [pattern-guard.md](pattern-guard.md) | [ide-pattern-guard.md](ide-pattern-guard.md) |
| `{ … final-expr }` block expressions | [block-expression.md](block-expression.md) | [ide-block-expression.md](ide-block-expression.md) |
| `a..b` / `a..=b` ranges | [range-expression.md](range-expression.md) | [ide-range-expression.md](ide-range-expression.md) |
| `?` postfix on `Result` | [try-operator.md](try-operator.md) | [ide-try-operator.md](ide-try-operator.md) |
| `Result`, `Ok`, `Err` | [result-type.md](result-type.md) | [ide-result-type.md](ide-result-type.md) |
| Struct unions | [struct-union.md](struct-union.md) | [ide-struct-union.md](ide-struct-union.md) |
| `Self` type | [self-type.md](self-type.md) | [ide-self-type.md](ide-self-type.md) |
| `///` and `/** */` doc comments | [doc-comments.md](doc-comments.md) | [ide-doc-comments.md](ide-doc-comments.md) |

## Macros

| Feature | Language | IDE |
| --- | --- | --- |
| `#[…]` macros | [macro.md](macro.md) | [ide-macro.md](ide-macro.md) |
| `#[derive(…)]` | [derive-macro.md](derive-macro.md) | [ide-derive-macro.md](ide-derive-macro.md) |
| Field constraint macros | [field-constraint-macro.md](field-constraint-macro.md) | [ide-field-constraint-macro.md](ide-field-constraint-macro.md) |
| `#[test]` attribute | [test-attribute.md](test-attribute.md) | [ide-test-attribute.md](ide-test-attribute.md) |
| Custom user macros | [custom-macros.md](custom-macros.md) | [ide-custom-macros.md](ide-custom-macros.md) |

## Editor surface

| Feature | Spec |
| --- | --- |
| Outline / `textDocument/documentSymbol` | [document-symbol.md](document-symbol.md) / [ide-document-symbol.md](ide-document-symbol.md) |
| Find references | [find-references.md](find-references.md) / [ide-find-references.md](ide-find-references.md) |
| Rename symbol | [rename-symbol.md](rename-symbol.md) / [ide-rename-symbol.md](ide-rename-symbol.md) |
| Workspace symbol search | [workspace-symbol.md](workspace-symbol.md) / [ide-workspace-symbol.md](ide-workspace-symbol.md) |
| Signature help | [signature-help.md](signature-help.md) / [ide-signature-help.md](ide-signature-help.md) |
| Code lens | [code-lens.md](code-lens.md) / [ide-code-lens.md](ide-code-lens.md) |
| Inlay hints | [inlay-hints.md](inlay-hints.md) / [ide-inlay-hints.md](ide-inlay-hints.md) |
| `neoc fmt` / formatting | [fmt.md](fmt.md) / [ide-fmt.md](ide-fmt.md) |

## Roadmap

Features still on the roadmap (exhaustiveness checking, operator overloading via metatables, associated types on traits, doctest blocks, `neoc doc` static-site generator) — see [roadmap.md](roadmap.md).
