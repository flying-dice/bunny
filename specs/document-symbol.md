# Feature: Document symbol outline

**Scope:** the in-memory shape of the outline tree a neoc document exposes to its editor.

## Top-level entries
- **Given** a `.neoc` document, **when** the outline is built, **then** one entry is emitted per recognised `ModulePart` and `opaque` parts are skipped.
- **Given** a `struct Foo { … }` declaration, **when** the outline is built, **then** the entry has kind `Struct`, name `Foo`, and one child per declared field.
- **Given** a `trait T { … }` declaration, **when** the outline is built, **then** the entry has kind `Interface`, name `T`, and one child per declared method (required and default alike).
- **Given** an inherent `impl Foo { … }`, **when** the outline is built, **then** the entry has kind `Class`, name `Foo`, detail `impl`, and one child per method.
- **Given** a trait `impl Trait for Foo { … }`, **when** the outline is built, **then** the entry has kind `Class`, name `Foo`, detail `impl Trait`, and one child per method.
- **Given** a top-level `function foo(…) { … }`, **when** the outline is built, **then** the entry has kind `Function`, name `foo`, and detail set to the function's signature. Functions have no children.

## Children
- **Given** a struct field, **when** the outline is built, **then** the child has kind `Field` and detail set to the field's declared type. Optional fields' detail reads `<Type> | undefined`.
- **Given** a trait or impl method, **when** the outline is built, **then** the child has kind `Method` and detail set to the method's signature.

## Ordering
- **Given** a source file, **when** the outline is built, **then** entries appear in source order; children follow the order of fields / methods inside their declaration.

## Ranges
- **Given** any outline entry, **when** the outline is built, **then** `range` covers the declaration's full span and `selectionRange` covers just the declaration's name.

## Symbol kind mapping
| neoc construct | LSP `SymbolKind` | Integer |
| --- | --- | --- |
| struct | `Struct` | 23 |
| struct field | `Field` | 8 |
| trait | `Interface` | 11 |
| trait method | `Method` | 6 |
| impl (inherent or trait) | `Class` | 5 |
| impl method | `Method` | 6 |
| function | `Function` | 12 |

## Parse failure
- **Given** a document that fails to parse, **when** the outline is built, **then** an empty list is returned — the editor renders no outline rather than stale data.
