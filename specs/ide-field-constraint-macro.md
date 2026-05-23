# IDE Language Feature: Field constraint macros

**Scope:** editor support for `#[minLength], #[minimum], #[format], …`

## Highlighting
- **Given** a `#[…]` constraint attached to a field, **when** highlighting runs, **then** the entire block is coloured as one attribute token.

## Completion
- **Given** the cursor is at the start of an attribute on a struct field, **when** completion runs, **then** the registered field-constraint names appear (`minLength`, `maxLength`, `minimum`, `maximum`, `format`, `pattern`).

## Hover
- **Given** the cursor is on a constraint name, **when** hover runs, **then** the popup shows the expected argument type and the runtime behaviour.

## Diagnostics
- **Given** a constraint macro with the wrong number / type of arguments, **when** the macro runs, **then** a diagnostic is reported at the attribute's span.

## Transpile
- **Given** a struct field with one or more constraint macros, **when** transpiled, **then** each macro contributes a check to the struct's `.new` body.

## Run
- **Given** a `.new` call with valid data, **when** invoked, **then** all constraints pass and a frozen struct value is returned.
- **Given** a `.new` call with data violating a constraint, **when** invoked, **then** a `ConstraintError` carrying the failing field / constraint is thrown.
