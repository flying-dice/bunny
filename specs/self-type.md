# Feature: `Self` type

**Scope:** the `Self` keyword as a placeholder for the implementing type inside trait declarations and impl blocks.

## In traits
- **Given** a trait method signature using `Self`, **when** parsed, **then** `Self` stands for whichever type implements the trait.
- **Given** a trait method's default body referencing `Self.foo(…)`, **when** emitted, **then** the body is templated and re-resolved at each `impl … for X { … }` site.

## In impl blocks
- **Given** an `impl … for X { … }` block, **when** transpiled, **then** every `Self` is rewritten to the target struct's name (`X`).
- **Given** an impl method with `self: Self`, **when** transpiled, **then** the parameter type becomes `self: X`.

## In structs
- **Given** a `struct` declaration, **when** any field references `Self`, **then** the parser rejects it — `Self` is only legal inside trait and impl scopes.

## Disambiguation
- **Given** any source position, **when** `Self` (capital S) appears, **then** it is the type-level placeholder; **when** `self` (lowercase) appears as a parameter name, **then** it is the runtime receiver.
