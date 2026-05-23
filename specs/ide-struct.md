# IDE Language Feature: `struct` keyword

**Scope:** editor support for `struct` declarations.

## Highlighting
- **Given** a source file, **when** the text `struct` appears as a keyword, **then** it is coloured as a keyword.
- **Given** a struct declaration, **when** highlighting runs, **then** the struct's name is coloured as a type identifier.
- **Given** a field name, **when** highlighting runs, **then** it is coloured as a property.

## Completion
- **Given** the cursor is at the start of a declaration, **when** completion runs, **then** `struct` appears in the suggestion list.
- **Given** the cursor is at a type-position (after `:`, `as`, or `impl … for`), **when** completion runs, **then** every visible struct name appears.
- **Given** the cursor is in `<receiver>.<word>` position and the receiver's declared type resolves to a struct, **when** completion runs, **then** that struct's fields appear with their declared type.

## Hover
- **Given** the cursor is on a struct name, **when** hover runs, **then** the popup shows the signature plus any `///` doc comment.
- **Given** the cursor is on a field reference (e.g. `self.id`), **when** hover runs, **then** the popup shows the field's name and declared type.

## Goto definition
- **Given** the cursor is on a struct name used in another module, **when** goto-definition runs, **then** the editor jumps to the `struct` declaration.

## Parsing
- **Given** a `struct` declaration with name and field block, **when** parsed, **then** it is recognised as a struct definition.
- **Given** a `struct` with no name after it, **when** parsed, **then** an error is reported and the rest of the file still parses.
- **Given** a field with a missing type, **when** parsed, **then** an error is reported pointing at the field.

## Transpile
- **Given** a valid struct declaration, **when** transpiled, **then** it produces a TypeScript `type` alias plus a `const` with a `.new` constructor that validates field constraints.

## Run
- **Given** a transpiled struct, **when** `.new(data)` is called, **then** the value carries the runtime `_struct` brand and field constraints have run.
