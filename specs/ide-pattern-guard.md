# IDE Language Feature: pattern guards on `match` arms

**Scope:** editor support for guarded match arms.

## Highlighting
- **Given** a `match` arm with an `if` guard, **when** highlighting runs, **then** the `if` keyword is coloured as a keyword.
- **Given** a guard expression, **when** highlighting runs, **then** identifiers and operators inside it use the same colours as elsewhere in expression position.

## Completion
- **Given** the cursor sits in an arm immediately after a pattern, **when** completion runs, **then** `if` appears in the suggestion list.
- **Given** the cursor is inside a guard expression with bindings from the arm's pattern in scope, **when** completion runs, **then** those binding names appear in the suggestion list.

## Hover
- **Given** the cursor is on a binding inside a guard expression, **when** hover runs, **then** the popup shows the binding's source pattern.

## Parsing
- **Given** a match arm with an `if` clause between the pattern and `=>`, **when** parsed, **then** the guard expression is attached to the `match_arm` node under the `guard` field.
- **Given** a guard expression missing the `=>` afterwards, **when** parsed, **then** an error is reported and the rest of the file still parses.

## Transpile
- **Given** a guarded arm, **when** transpiled, **then** the guard is emitted as an inner `if` that runs after the pattern check and binds, so a failing guard falls through to the next arm.
- **Given** every catch-all arm in a `match` carries a guard, **when** transpiled, **then** the IIFE still emits the `match: no arm matched` fallback.

## Run
- **Given** a guarded arm whose guard returns true at runtime, **when** the scrutinee matches the pattern, **then** the arm's right-hand side is returned.
- **Given** a guarded arm whose guard returns false at runtime, **when** the scrutinee matches the pattern, **then** evaluation continues with the next arm.
