# IDE Language Feature: Document symbol outline

**Scope:** editor support for the structure / outline panel of a `.neoc` file.

## Capability
- **Given** an LSP client connects to the neoc server, **when** `initialize` returns, **then** the `documentSymbolProvider` capability is advertised.

## Request
- **Given** an open `.neoc` document, **when** the client sends `textDocument/documentSymbol`, **then** the server replies with a tree of `DocumentSymbol` nodes — never the flat `SymbolInformation[]` form.
- **Given** the document hasn't been opened (no `didOpen`), **when** the request runs, **then** the server replies with an empty list.

## Outline shape
- **Given** a struct, **when** the outline renders, **then** it appears as a `Struct` node with one `Field` child per declared field.
- **Given** a trait, **when** the outline renders, **then** it appears as an `Interface` node with one `Method` child per declared method.
- **Given** an inherent impl, **when** the outline renders, **then** it appears as a `Class` node with detail `impl` and one `Method` child per method.
- **Given** a trait impl, **when** the outline renders, **then** it appears as a `Class` node with detail `impl <Trait>` and one `Method` child per method.
- **Given** a top-level function, **when** the outline renders, **then** it appears as a `Function` node with no children and detail set to its signature.

## Cursor selection
- **Given** the editor jumps to an outline entry, **when** the entry's `selectionRange` is used, **then** the cursor lands on the declaration's name token, not the keyword that precedes it.

## Live updates
- **Given** the user edits a declaration's name or body, **when** the next `didChange` lands, **then** a follow-up `documentSymbol` request reflects the new outline.

## Symbol kind mapping
The integer values for each `SymbolKind` follow the LSP specification — `Struct = 23`, `Field = 8`, `Interface = 11`, `Method = 6`, `Class = 5`, `Function = 12`.

## Editor surfaces
- **Zed** — Outline (`cmd-shift-o`) and the Symbols quick-pick.
- **IntelliJ** — Structure tool window (`cmd-7`) and File Structure popup (`cmd-F12`).
