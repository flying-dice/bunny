# Feature: `Result<T, E>`, `Ok`, `Err`

**Scope:** the global Result type and its constructors, used to model recoverable errors without exceptions.

## Form
- **Given** the ambient `Result<T, E>` type, **when** referenced anywhere in source, **then** it resolves to a union of `{ ok: true, value: T }` and `{ ok: false, error: E }`.
- **Given** `Ok(value)`, **when** called, **then** it returns `{ ok: true, value }`.
- **Given** `Err(error)`, **when** called, **then** it returns `{ ok: false, error }`.

## Identity
- **Given** any `Result` value, **when** matched, **then** the discriminator field is `ok`, not a struct brand.
- **Given** a function returning `Result<T, E>`, **when** the caller wants the value, **then** matching on `ok` is the only way to extract it — there is no implicit unwrapping.

## Conventions
- **Given** an error case, **when** modelled, **then** `E` is typically a neoc struct (or a union of struct types), so each error variant carries its own structured payload.

## Ambient injection
- **Given** any neoc file, **when** transpiled, **then** the emitter prepends an ambient declaration of `Result`, `Ok`, `Err`, and `ConstraintError` so user code can use them without an import.
