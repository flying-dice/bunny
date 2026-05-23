# Feature: Rust-style doc comments

**Scope:** `///` triple-slash line comments and `/** … */` block comments used as documentation immediately preceding a declaration.

## Form
- **Given** one or more contiguous `///` lines, **when** they sit directly before a `struct`, `trait`, `impl`, or `function` declaration (after any `#[…]` attribute macros), **then** they are the declaration's doc comment.
- **Given** a `/** … */` block, **when** it sits directly before such a declaration, **then** the inner text (with leading ` * ` stripped per line) is the declaration's doc comment.

## Content
- **Given** a doc comment, **when** rendered, **then** the body is treated as Markdown — code blocks, lists, emphasis, links all work.

## Attribute interaction
- **Given** a doc comment, an attribute block, and a declaration in source order, **when** parsed, **then** the doc still belongs to the declaration — attributes do not break the association.

## Transpile
- **Given** a doc comment, **when** transpiled to Lua, **then** the body passes through with `///` rewritten to `---` (Lua's documentation form) and `//` rewritten to `--`.
