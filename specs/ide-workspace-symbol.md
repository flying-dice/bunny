# IDE Language Feature: Workspace symbol picker

**Scope:** editor support for the global "go to symbol" picker over a `.neoc` workspace.

## Capability
- **Given** an LSP client connects to the neoc server, **when** `initialize` returns, **then** the `workspaceSymbolProvider` capability is advertised.

## Request
- **Given** an open workspace, **when** the client sends `workspace/symbol` with a query string, **then** the server replies with an array of `WorkspaceSymbol` entries filtered by case-insensitive substring match on each entry's `name`.
- **Given** an empty query, **when** the request runs, **then** every harvested top-level declaration is returned.
- **Given** a workspace with no `.neoc` files, **when** the request runs, **then** the server replies with an empty array.

## Response shape
Each entry has the standard LSP `WorkspaceSymbol` fields:
- `name` — the declaration's identifier.
- `kind` — `Struct`, `Interface`, `Function`, or `Class` (see mapping below).
- `location` — `{ uri, range }` pointing at the declaration in its source file.
- `containerName` — set to the trait name for `impl Trait for X` entries; undefined otherwise.

## Symbol kind mapping
The integer values follow the LSP specification — `Struct = 23`, `Interface = 11`, `Function = 12`, `Class = 5`.

## Live updates
- **Given** the user edits a declaration's name, **when** the next `didChange` lands, **then** a follow-up `workspace/symbol` request reflects the new name. The index is refreshed per-file on every change.

## Editor surfaces
- **Zed** — Go to Symbol in Project (`cmd-t`).
- **IntelliJ** — Go to Symbol (`cmd-option-o`).
