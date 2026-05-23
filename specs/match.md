# Feature: `match` expression

**Scope:** Rust-style pattern matching on a scrutinee value.

## Form
- **Given** the `match` keyword followed by an expression and a brace block of arms, **when** parsed, **then** it is a single expression that evaluates to the result of the first matching arm.
- **Given** a match expression, **when** every arm yields a value, **then** the whole `match` is a value-producing expression usable inside `return`, assignments, template literals.

## Patterns
- **Given** a wildcard `_` arm, **when** evaluated, **then** it always matches.
- **Given** a literal pattern (number, string, boolean), **when** evaluated, **then** the arm matches iff `scrutinee === literal`.
- **Given** a binding pattern (`name`), **when** evaluated, **then** it always matches and the scrutinee is bound to `name` inside the arm.
- **Given** an object pattern `{ key: value, … }`, **when** evaluated, **then** the arm matches iff every key satisfies its sub-pattern.
- **Given** a struct pattern `<Struct> { … }`, **when** evaluated, **then** the arm matches iff `scrutinee._struct === "<Struct>"` and every field sub-pattern matches.
- **Given** an object pattern key with a bare identifier (`{ name }`), **when** evaluated, **then** the field's value is bound to `name`.
- **Given** an object pattern key with a `: literal` (`{ ok: true }`), **when** evaluated, **then** the field is compared by value.

## Exhaustiveness
- **Given** a match with no wildcard or binding arm, **when** the scrutinee falls through every other arm, **then** a `match: no arm matched` error is thrown at runtime.

## Scope
- **Given** an arm with bound names, **when** the right-hand side runs, **then** the bindings are in scope inside that arm only.
