# IDE Language Feature: `#[derive(…)]`

**Scope:** editor support for derive macros.

## Highlighting
- **Given** a `#[derive(…)]` attribute, **when** highlighting runs, **then** the entire `#[derive(…)]` block reads as one attribute token (no separate colouring for derive names inside).

## Completion
- **Given** the cursor is inside `#[derive(…)]`, **when** completion runs, **then** the available derive names appear (`Clone`, `Equals`, `ToJson`, `Default`, `Hash`, `Display`).
- **Given** the cursor is after a comma inside `#[derive(…)]`, **when** completion runs, **then** the same derive name list appears, omitting any already present in the same list.

## Hover
- **Given** the cursor is on a derive name, **when** hover runs, **then** the popup explains what the derive emits.

## Transpile
- **Given** a struct with a derive macro applied, **when** transpiled, **then** the derived method is present on the emitted struct const.

## Run
- **Given** a transpiled derive method, **when** invoked on a struct value, **then** it produces the documented result (clone, equality, JSON form, default, hash, display).
