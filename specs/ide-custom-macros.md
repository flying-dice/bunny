# IDE Language Feature: User-authored macros (`--macro`)

**Scope:** editor support for user-authored macros loaded via `--macro`.

## Highlighting
- **Given** a `#[name(args…)]` attribute whose name resolves to a user-authored macro, **when** highlighting runs, **then** the entire `#[…]` block reads as one attribute token (same as a built-in).

## Completion
- **Given** the cursor is at the start of an attribute on a struct field, **when** completion runs, **then** the names of registered user-authored field-constraint macros appear alongside the built-ins.
- **Given** the cursor is inside `#[derive(…)]`, **when** completion runs, **then** the names of registered user-authored derive macros appear alongside the built-ins.

## Hover
- **Given** the cursor is on a user-authored macro name, **when** hover runs, **then** the popup names the macro and its kind (derive / field-constraint / function-attr). Documentation strings authored on the macro object are surfaced when present.

## Diagnostics
- **Given** an attribute whose name matches no registered macro, **when** the compiler runs, **then** a diagnostic is reported at the attribute's span.
- **Given** a user-authored macro module that fails to import, **when** the LSP or CLI starts, **then** the import error surfaces as a workspace-level diagnostic.

## Transpile
- **Given** a user-authored derive macro applied to a struct, **when** transpiled, **then** the emitted method is present on the struct's table.
- **Given** a user-authored field-constraint macro applied to a field, **when** transpiled, **then** its guards are woven into the struct's `.new` body.

## Run
- **Given** the emitted Lua for `#[derive(JsonString)]`, **when** invoked on a struct value, **then** it returns a JSON-encoded string of the struct's fields.
- **Given** the emitted Lua for `#[email]`, **when** `.new` is called with an invalid email, **then** an error is raised carrying the struct name, field name, and a description of the constraint.
