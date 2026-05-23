# Feature: tuple-struct (newtype) shorthand

**Scope:** Rust-style `struct Foo(T)` shorthand for declaring a single-field struct.

## Declaration
- **Given** the `struct` keyword followed by an UpperCamel name and a parenthesised type, **when** parsed, **then** a new struct type is defined with one field.
- **Given** a tuple-struct declaration, **when** desugared, **then** it is equivalent to `struct Foo { value: T, }` — the single field is named `value`.
- **Given** a tuple-struct declaration, **when** it carries `export`, **then** the type and its `.new` constructor are visible to other modules.

## Identity
- **Given** any tuple-struct value, **when** emitted, **then** it carries the same hidden `_struct?: "<Name>"` brand as a block-form struct.
- **Given** two newtypes wrapping the same payload type but with different names, **when** matched, **then** they remain distinct types.

## Construction
- **Given** a tuple struct `Foo(T)`, **when** code calls `Foo.new({ value: x })`, **then** a branded value `{ value: x, _struct: "Foo" }` is returned.

## Attributes
- **Given** a tuple-struct declaration, **when** parsed, **then** it carries no field-attribute slots — field-constraint macros must use the block form.
- **Given** a tuple-struct that needs struct-level derives or field constraints, **when** writing the declaration, **then** use the block form `struct Foo { value: T }` instead.
