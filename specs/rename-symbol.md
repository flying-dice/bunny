# Feature: rename symbol

**Scope:** Workspace-wide rename of a struct, trait, function, impl,
field, or method.

## Form
- **Given** the cursor sits on a renameable identifier, **when** the
  rename request is issued with a new name, **then** every occurrence
  of the old name in the workspace is replaced by the new one.
- **Given** the new name is not a valid identifier (empty, starts with
  a digit, contains punctuation), **when** rename runs, **then** no
  edit is produced and the request fails fast.
- **Given** the new name equals the old name, **when** rename runs,
  **then** the result is an empty `WorkspaceEdit` (no churn).

## Scope of the scan
- **Given** the symbol is declared in file `A.neoc` and referenced in
  `B.neoc`, **when** rename runs from either file, **then** edits land
  in both files.
- **Given** the workspace contains multiple roots, **when** rename
  runs, **then** every `.neoc` file under every root is scanned.
- **Given** the open document has unsaved edits, **when** rename runs,
  **then** the in-memory text is scanned (not the on-disk copy) so
  edits reflect the user's current buffer.

## Boundaries
- **Given** a string literal containing the old name, **when** rename
  runs, **then** the literal is **not** rewritten.
- **Given** a line comment (`//…`) or block comment (`/* … */`)
  containing the old name, **when** rename runs, **then** the comment
  is **not** rewritten.
- **Given** another identifier that happens to contain the old name
  as a substring (e.g. `Widgets` when renaming `Widget`), **when**
  rename runs, **then** the longer identifier is **not** touched —
  the scan matches on full-word boundaries only.

## Non-goals
- The rename is **lexical**, not semantic. A struct named `Foo` and a
  function also named `Foo` are renamed together — the language has no
  separate namespaces for the two today, but if it gains them, the
  rename will still apply across both.
- Renaming a local binding (a `let` variable) is out of scope. The
  rename targets top-level declarations and their cross-file
  references.
