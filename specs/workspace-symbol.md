# Feature: Workspace symbol index

**Scope:** the in-memory shape of the global symbol list neoc exposes to its editor's "go to symbol" picker.

## Index contents
- **Given** a workspace, **when** the index is built, **then** one entry is emitted per top-level `struct`, `trait`, `function`, and `impl` discovered across every `.neoc` file under the workspace roots. `opaque` parts are skipped.
- **Given** an `impl Trait for X { … }` block, **when** the index is built, **then** the entry's `containerName` is the trait name.
- **Given** an inherent `impl X { … }` block, **when** the index is built, **then** the entry's `containerName` is undefined.

## Query
- **Given** a query string, **when** the index is filtered, **then** the match is a case-insensitive substring test against each entry's `name`.
- **Given** an empty query, **when** the index is filtered, **then** every harvested entry is returned — the picker uses that to populate on first open.

## Symbol kind mapping
| neoc construct | LSP `SymbolKind` | Integer |
| --- | --- | --- |
| struct | `Struct` | 23 |
| trait | `Interface` | 11 |
| function | `Function` | 12 |
| impl | `Class` | 5 |

## Ranges
- **Given** any entry, **when** the index is built, **then** `location.range` covers the declaration's full span in its source file and `location.uri` points at that file.

## Freshness
- **Given** the user edits a declaration, **when** the next `didChange` lands, **then** a follow-up `workspace/symbol` request reflects the updated index.
