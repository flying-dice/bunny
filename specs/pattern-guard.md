# Feature: pattern guards on `match` arms

**Scope:** an optional `if <expression>` clause between a `match` arm's pattern and its `=>` arrow that gates the arm on a boolean condition.

## Form
- **Given** a `match` arm, **when** the pattern is followed by `if <expression>`, **then** the expression is the arm's guard.
- **Given** a guard, **when** it evaluates to a truthy value, **then** the arm's right-hand side runs.
- **Given** a guard, **when** it evaluates to a falsy value, **then** the arm is skipped and the next arm is tried.

## Scope
- **Given** a struct or object pattern with field bindings and a guard, **when** the guard expression is evaluated, **then** the bindings are in scope for the guard.
- **Given** a binding pattern `name` with a guard, **when** the guard is evaluated, **then** `name` refers to the scrutinee.

## Exhaustiveness
- **Given** a wildcard or binding arm carrying a guard, **when** every arm's guard fails, **then** a `match: no arm matched` runtime error is thrown — a guarded catch-all is not a true catch-all.
- **Given** a wildcard or binding arm with no guard, **when** the match reaches it, **then** it always matches and no fallback is emitted.

## Evaluation order
- **Given** a struct or object pattern, **when** the scrutinee fails the pattern check, **then** the guard is not evaluated.
- **Given** a literal pattern, **when** the scrutinee does not equal the literal, **then** the guard is not evaluated.
