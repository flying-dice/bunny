# IDE Language Feature: fmt

**Scope:** editor support for `textDocument/formatting` on `.neoc` files.

## Capability
- **Given** the LSP `initialize` handshake, **when** the server responds, **then** the capabilities advertise `documentFormattingProvider: true`.

## Request
- **Given** the user invokes "format document" on an open `.neoc` buffer, **when** the editor sends `textDocument/formatting`, **then** the server returns an array containing one `TextEdit` whose range covers the whole document and whose `newText` is the canonical-formatted source.
- **Given** the document is already canonical, **when** the editor sends `textDocument/formatting`, **then** the server returns an empty array so the editor doesn't mark the buffer dirty.
- **Given** the editor requests formatting for an unknown URI, **when** the server has no `DocState` for it, **then** the server returns an empty array.

## Behaviour
- The formatting performed matches `specs/fmt.md` rule-for-rule — the LSP path and the CLI `neoc fmt` path share the same `formatSource` implementation.

## Limitations
- Range formatting (`textDocument/rangeFormatting`) and on-type formatting (`textDocument/onTypeFormatting`) are not provided. Editors fall back to whole-document formatting.
