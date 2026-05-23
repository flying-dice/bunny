# Feature: Field constraint macros

**Scope:** macros that validate struct field values inside the emitted `.new` constructor.

## Form
- **Given** a struct field, **when** preceded by `#[macro(args…)]`, **then** the macro's check is woven into the struct's `.new`.

## Built-in constraints
- **Given** `#[minLength(n)]` on a string field, **when** `.new` runs, **then** the field's length must be `>= n` or a `ConstraintError` is thrown.
- **Given** `#[maxLength(n)]` on a string field, **when** `.new` runs, **then** the field's length must be `<= n`.
- **Given** `#[minimum(n)]` on a number field, **when** `.new` runs, **then** the field must be `>= n`.
- **Given** `#[maximum(n)]` on a number field, **when** `.new` runs, **then** the field must be `<= n`.
- **Given** `#[format("email" | "url" | "uuid" | "datetime")]` on a string field, **when** `.new` runs, **then** the field must satisfy the corresponding format pattern.
- **Given** `#[pattern("<regex>")]` on a string field, **when** `.new` runs, **then** the field must match the supplied regex.

## Errors
- **Given** any constraint failure, **when** thrown, **then** the error is a `ConstraintError` carrying `field`, `constraint`, and `value` properties.

## Composition
- **Given** multiple constraints on a field, **when** `.new` runs, **then** they are checked in source order, failing on the first violation.
- **Given** a constraint whose name isn't a registered macro, **when** compiled, **then** a diagnostic is reported.
