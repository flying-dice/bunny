# IDE Language Feature: code lens

**Scope:** editor support for `textDocument/codeLens` on `.neoc` files.

## Capability
- **Given** the LSP `initialize` handshake, **when** the server responds, **then** the capabilities advertise `codeLensProvider: { resolveProvider: false }` — every lens ships fully resolved on the initial request.

## Request
- **Given** the user opens a `.neoc` file, **when** the editor sends `textDocument/codeLens`, **then** the server returns one array entry per recognised declaration lens (run-test and references).
- **Given** the document failed to parse, **when** code lenses are requested, **then** the server returns an empty array.

## Lens shape
- **Given** a `#[test]` function `foo`, **when** the server emits the run-test lens, **then** `command.title` is `▶ Run test`, `command.command` is `neoc.runTest`, and `command.arguments` is `["foo"]`.
- **Given** any struct, trait, or function `Foo`, **when** the server emits the references lens, **then** `command.title` is `<N> reference[s]`, `command.command` is `neoc.showReferences`, and `command.arguments` is `[{ uri, position }]` where `position` lands on the declaration's name token.
- **Given** any emitted lens, **when** the editor reads it, **then** `range` spans column 0 through the end of the declaration's first line.

## Filtering
- **Given** an `impl` block, **when** lenses are emitted, **then** the block itself receives no lens — code lens is anchored to declarations of distinct symbols (struct / trait / function), not their inherent or trait implementations.
- **Given** an `opaque` module part (raw text the parser passed through), **when** lenses are emitted, **then** no lens is produced for that part.

## Limitations
- No semantic disambiguation: the reference count comes from a textual scan, so same-named symbols across files share a count.
- Workspace scans are capped at 50 roots per request to keep the lens cheap.
- The commands `neoc.runTest` and `neoc.showReferences` are exposed on the lens but not yet handled server-side; the editor surfaces them, the server replies with method-not-found.
