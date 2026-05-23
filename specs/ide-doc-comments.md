# IDE Language Feature: Rust-style doc comments

**Scope:** editor support for `///` and `/** … */` doc comments.

## Highlighting
- **Given** a source file, **when** a `///` line appears, **then** it is coloured as a doc comment (visually distinct from a regular `//` line).
- **Given** a `/** … */` block, **when** highlighting runs, **then** it is coloured as a doc block comment (distinct from a regular `/* … */`).

## Hover
- **Given** the cursor is on a declaration with a doc comment, **when** hover runs, **then** the popup renders the doc body as Markdown below the declaration's signature.

## Completion
- **Given** a completion item resolves to a declaration with a doc comment, **when** the popup opens, **then** the item's documentation panel renders the doc body as Markdown.

## Cross-file
- **Given** a doc comment in one file and a reference in another, **when** hover or completion runs at the reference, **then** the doc body is surfaced — the workspace symbol index carries it.

## Parsing
- **Given** a doc comment immediately preceded by `#[…]` attributes, **when** scanned backward from the declaration, **then** the editor skips over the attributes and finds the doc.
