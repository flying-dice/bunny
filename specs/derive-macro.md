# Feature: `#[derive(…)]`

**Scope:** built-in derive macros that synthesise methods on structs.

## Form
- **Given** a `#[derive(A, B, C)]` attribute on a struct, **when** compiled, **then** each named derive macro emits methods onto the struct's const.

## Built-in derives
- **Given** `Clone`, **when** derived, **then** the struct gets a `.clone(v)` method returning a deep copy with the brand preserved.
- **Given** `Equals`, **when** derived, **then** the struct gets a `.equals(a, b)` method returning structural equality.
- **Given** `ToJson`, **when** derived, **then** the struct gets a `.toJson(v)` method returning a JSON-serialisable plain object (no brand, no methods).
- **Given** `Default`, **when** derived, **then** the struct gets a `.default()` method returning a value constructed from each field's declared default.
- **Given** `Hash`, **when** derived, **then** the struct gets a `.hash(v)` method returning a stable string fingerprint of the value.
- **Given** `Display`, **when** derived, **then** the struct receives an `impl Display` whose `display` method returns the result of stringifying the fields.

## Composition
- **Given** more than one derive, **when** compiled, **then** the macros run in declaration order and may all be present on the same struct.
- **Given** a derive name that isn't a registered macro, **when** compiled, **then** a diagnostic is reported at the name's span.
