# IDE Language Feature: rename symbol

**Scope:** editor support for renaming a struct, trait, function, impl,
field, or method across the workspace.

## Capability
- **Given** a connected client, **when** the LSP advertises its
  capabilities, **then** `renameProvider` is `{ prepareProvider: true }`
  so the editor knows it can ask for both `textDocument/prepareRename`
  and `textDocument/rename`.

## Prepare
- **Given** the cursor sits on a renameable identifier, **when**
  `textDocument/prepareRename` runs, **then** the response is
  `{ range, placeholder }` where `range` covers the identifier under
  the cursor and `placeholder` is its current text.
- **Given** the cursor sits on whitespace, a keyword, or a primitive
  type name (`string`, `number`, `boolean`, `table`, `nil`), **when**
  prepare runs, **then** the response is `null` and the editor
  suppresses the rename prompt.

## Rename
- **Given** the editor calls `textDocument/rename` with a valid new
  name, **when** the server resolves the request, **then** the result
  is a `WorkspaceEdit` whose `changes` map groups one `TextEdit[]` per
  URI touched.
- **Given** the symbol is declared in one file and referenced in
  another, **when** the editor applies the workspace edit, **then**
  both files end up with the new name and the cross-file `goto
  definition` flow keeps working.
- **Given** the new name collides with an existing declaration,
  **when** the editor applies the edit, **then** the resulting parse
  reports a duplicate-declaration diagnostic — the rename itself does
  not pre-check for collisions.

## Boundaries
- **Given** the old name appears inside a string literal or a comment,
  **when** rename runs, **then** that occurrence is left intact.
- **Given** the old name appears as a substring of a longer
  identifier, **when** rename runs, **then** the longer identifier is
  left intact.

## Failure modes
- **Given** the new name fails the identifier syntax check, **when**
  rename runs, **then** the server responds with `null` and the editor
  surfaces the rejection to the user.
- **Given** the document failed to parse, **when** rename runs,
  **then** the lexical scan still proceeds — rename is robust to
  partial parses since it operates on the text buffer, not the AST.
