# Feature: `impl` keyword

**Scope:** attaching methods to a struct, either inherent or via a trait.

## Inherent `impl`
- **Given** the `impl` keyword followed by a struct name and a method block, **when** parsed, **then** each method lands on the struct's emitted const as a static method.
- **Given** an inherent method, **when** it takes `self: <Struct>` as its first parameter, **then** call sites may invoke it as `instance.method(...)` after lowering.

## Trait `impl`
- **Given** `impl <Trait> for <Struct>`, **when** parsed, **then** the methods bind to the struct as the trait's implementation.
- **Given** a trait with required methods, **when** an `impl … for <Struct>` block omits any of them, **then** it is a compile error.
- **Given** a trait with default-bodied methods, **when** an impl omits them, **then** the trait's default body is inherited unchanged.
- **Given** a trait method that uses `Self`, **when** the impl is emitted, **then** every `Self` is rewritten to the implementing struct's name.

## Multiple impls
- **Given** the same struct, **when** it has more than one `impl` block, **then** the methods are merged onto a single emitted const.
- **Given** the same struct, **when** it implements two traits that both define a member with the same name, **then** the latter `impl` wins and a warning is emitted.

## Generics
- **Given** an `impl` block with `<T, U>` between `impl` and the target type, **when** parsed, **then** the generic parameters are in scope for every method signature.
