# IDE Language Feature: `Result<T, E>`, `Ok`, `Err`

**Scope:** editor support for the ambient Result type.

## Highlighting
- **Given** a source file, **when** the identifiers `Result`, `Ok`, `Err`, or `ConstraintError` appear, **then** they are coloured as type identifiers (Result, ConstraintError) or functions (Ok, Err).

## Completion
- **Given** the cursor is in expression position, **when** completion runs, **then** `Ok` and `Err` appear in the suggestion list as functions.
- **Given** the cursor is in type position, **when** completion runs, **then** `Result` appears in the suggestion list.

## Hover
- **Given** the cursor is on `Result`, **when** hover runs, **then** the popup shows the structural definition (`{ ok: true, value: T } | { ok: false, error: E }`).
- **Given** the cursor is on `Ok` or `Err`, **when** hover runs, **then** the popup shows the constructor's signature.

## Diagnostics
- **Given** a function declared to return `Result<T, E>`, **when** any return path produces a value that isn't `Ok` or `Err`, **then** the neoc LSP reports a diagnostic at the offending return.

## Transpile
- **Given** any neoc module that references `Result`, `Ok`, or `Err`, **when** transpiled, **then** the emitter prepends a small Lua prelude that defines `Ok(value)` and `Err(error)` as local functions returning the canonical tagged tables.
