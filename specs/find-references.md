# Feature: find references

**Scope:** locate every textual use of a symbol (struct, trait, function) across the workspace.

## Form
- **Given** an identifier in a `.neoc` source file, **when** references are requested, **then** the result is the list of every word-boundary occurrence of that identifier in the open document and in every `.neoc` file under any workspace root.
- **Given** a position that is not on an identifier, **when** references are requested, **then** the result is an empty list.
- **Given** a request for identifier `Foo`, **when** scanning a file, **then** `Foo` matches in `: Foo`, `Foo {`, `Foo()`, `(Foo)` and similar; it does not match inside `Foobar`, `MyFoo`, or `_Foo123`.

## Scope
- **Given** a workspace with multiple roots, **when** references are requested, **then** every root is scanned and results are merged.
- **Given** the open document's URI also resolves to a workspace file on disk, **when** scanning, **then** the open document is scanned once (from its in-memory text) and the on-disk copy is skipped.
- **Given** an occurrence sits inside a `//` line comment, a `///` doc comment, or a `"…"` / `'…'` string literal, **when** scanning, **then** that occurrence is excluded.

## Limitations
- The scan is purely textual: it does not understand scope, shadowing, or imports. A local variable named `Foo` in one file and a struct named `Foo` in another both surface.
- Multi-line block comments, template literals, and escape-aware string parsing are not modelled.
- Renamed symbols (e.g. `import X as Y`) are tracked by their post-rename name only at the call site, not at the declaration.
