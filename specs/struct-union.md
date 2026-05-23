# Feature: Struct unions

**Scope:** modelling sum types as TypeScript-style unions of struct types, in lieu of a dedicated `enum` keyword.

## Form
- **Given** a `type Foo = A | B | C` declaration where each variant is a struct name, **when** parsed, **then** `Foo` is a union of struct identities.
- **Given** any value of a struct union type, **when** inspected at runtime, **then** its `_struct` brand identifies which variant it is.

## Why not `enum`
- **Given** the `enum` keyword, **when** considered, **then** it is reserved by TypeScript and conflicts when neoc output is consumed by TS; neoc deliberately uses struct unions instead.
- **Given** a struct union, **when** combined with `match` on a struct pattern, **then** discrimination is exhaustive without ceremony.

## Construction
- **Given** any union variant, **when** constructed, **then** the call uses that variant's own `.new(data)` — there is no shared union constructor.

## Pattern matching
- **Given** a `match` over a union, **when** an arm uses a struct pattern, **then** the arm's body sees the value narrowed to that variant.

## Composition
- **Given** a struct union value passed across a function boundary, **when** the parameter type is the union, **then** any variant is accepted; **when** the parameter type is a single variant, **then** only that variant is accepted.
