# tsb specs

Behaviour specifications for the tsb language and its editor support. Two files per feature:

- `<feature>.md` — semantics of the feature itself.
- `ide-<feature>.md` — what the editor should do for it (highlighting, completion, parsing, transpile, run).

Style: short, BDD-style **Given / When / Then** bullets, grouped into the relevant aspect of the feature.

## Implemented today

| Feature | Language | IDE |
| --- | --- | --- |
| `struct` declarations | [struct.md](struct.md) | [ide-struct.md](ide-struct.md) |
| `impl` blocks | [impl.md](impl.md) | [ide-impl.md](ide-impl.md) |
| `trait` declarations | [trait.md](trait.md) | [ide-trait.md](ide-trait.md) |
| `match` expressions | [match.md](match.md) | [ide-match.md](ide-match.md) |
| `#[…]` macros | [macro.md](macro.md) | [ide-macro.md](ide-macro.md) |
| `#[derive(…)]` | [derive-macro.md](derive-macro.md) | [ide-derive-macro.md](ide-derive-macro.md) |
| `#[minLength], #[minimum] …` | [field-constraint-macro.md](field-constraint-macro.md) | [ide-field-constraint-macro.md](ide-field-constraint-macro.md) |
| `#[get], #[post] …` route verbs | [route-verb-macro.md](route-verb-macro.md) | [ide-route-verb-macro.md](ide-route-verb-macro.md) |
| `Result`, `Ok`, `Err` | [result-type.md](result-type.md) | [ide-result-type.md](ide-result-type.md) |
| Struct unions (no `enum`) | [struct-union.md](struct-union.md) | [ide-struct-union.md](ide-struct-union.md) |
| `Self` type | [self-type.md](self-type.md) | [ide-self-type.md](ide-self-type.md) |
| `///` and `/** */` doc comments | [doc-comments.md](doc-comments.md) | [ide-doc-comments.md](ide-doc-comments.md) |

## Roadmap

Features common to major languages that tsb does not yet support — see [roadmap.md](roadmap.md) for the full list and rationale.
