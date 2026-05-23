# IDE Language Feature: `#[…]` attribute macros

**Scope:** editor support for the `#[…]` attribute system.

## Highlighting
- **Given** a source file, **when** a `#[ … ]` block appears, **then** the entire span is coloured as a single attribute token.
- **Given** a multi-line `#[ … ]` block, **when** highlighting runs, **then** the colouring stays consistent across the line break.

## Completion
- **Given** the cursor is inside `#[ … ]` at a top-level position, **when** completion runs, **then** every registered macro name appears with a kind label (derive / field-constraint / function-attribute).
- **Given** the cursor is inside `#[derive( … )]`, **when** completion runs, **then** only registered derive macros appear (`Clone`, `Equals`, `ToJson`, `Default`, `Hash`, `Display`).

## Hover
- **Given** the cursor is on a macro name inside `#[ … ]`, **when** hover runs, **then** the popup shows what the macro emits and any associated argument shape.

## Parsing
- **Given** a `#[ … ]` block attached to a supported declaration, **when** parsed, **then** the AST attribute list on that node contains a structured entry.
- **Given** an unterminated `#[ …`, **when** parsed, **then** an error is reported and the lexer recovers at the end of the line.

## Diagnostics
- **Given** an attribute that names an unknown macro, **when** the file is parsed, **then** a diagnostic is reported on the attribute name's span.
- **Given** an attribute whose argument shape doesn't match the macro's expectations, **when** the macro runs, **then** the macro emits a diagnostic at the attribute's span.
