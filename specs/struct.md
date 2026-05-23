# Feature: `struct` keyword

**Scope:** declaring product types with named fields.

## Declaration
- **Given** the `struct` keyword followed by an UpperCamel name and a field block, **when** parsed, **then** a new struct type is defined.
- **Given** a field block, **when** it lists `name: Type` entries separated by commas, **then** each becomes a named field of the struct.
- **Given** a field, **when** its name carries a `?`, **then** the field is optional.
- **Given** a struct declaration, **when** it carries `export`, **then** the type and its `.new` constructor are visible to other modules.

## Identity
- **Given** any struct value, **when** emitted, **then** it carries a hidden `_struct?: "<Name>"` brand so runtime code can match the struct by identity without a `kind` discriminator.
- **Given** two structs with identical field shapes but different names, **when** matched, **then** they remain distinct types.

## Construction
- **Given** a struct, **when** code calls `<Struct>.new(data)`, **then** every field constraint macro is checked and a frozen value is returned.
- **Given** a `.new(data)` call missing a required field, **when** executed, **then** it throws a `ConstraintError`.

## Generics
- **Given** a struct declaration with `<T, U>` between the name and the field block, **when** parsed, **then** each generic parameter is in scope for every field's type annotation.

## Attributes
- **Given** a struct declaration, **when** preceded by `#[derive(...)]`, **then** each named derive macro emits additional methods on the struct's const.
- **Given** a field, **when** preceded by `#[constraint(...)]`, **then** the constraint runs inside `.new`.
