# IDE Language Feature: find references

**Scope:** editor support for `textDocument/references` on `.neoc` files.

## Capability
- **Given** the LSP `initialize` handshake, **when** the server responds, **then** the capabilities advertise `referencesProvider: true`.

## Request
- **Given** the user invokes "find references" on an identifier, **when** the editor sends `textDocument/references`, **then** the server returns an array of `Location` objects covering every word-boundary occurrence of the identifier across the workspace.
- **Given** the cursor is on whitespace or punctuation, **when** references are requested, **then** the server returns an empty array.

## Filtering
- **Given** an occurrence sits inside a `//` or `///` comment, **when** the server scans, **then** the occurrence is omitted from the result.
- **Given** an occurrence sits inside a single- or double-quoted string literal, **when** the server scans, **then** the occurrence is omitted from the result.
- **Given** a candidate match is adjacent to identifier characters, **when** the server evaluates the boundary, **then** the candidate is omitted (no substring matches).

## Workspace iteration
- **Given** one or more workspace roots, **when** the server scans, **then** every `**/*.neoc` file under each root is read from disk and searched.
- **Given** the open document and a workspace file share a URI, **when** the server scans, **then** the open document's in-memory text is used and the disk copy is skipped.

## Limitations
- No scope analysis: shadowed names and imports are not resolved; a local `Foo` and a struct `Foo` in different files both appear.
- No tracking of block comments, escape sequences, or template literals — these may yield false positives.
