# Feature: `?` postfix operator on `Result<T, E>`

**Scope:** Rust-style early-return on `Err`.

## Form
- **Given** an expression that evaluates to a `Result<T, E>`, **when** followed by `?`, **then** the construct is a `try_expression`.
- **Given** a `try_expression` in a `let` initialiser (`let v = expr?;`), **when** parsed, **then** the variable binds to the inner `Ok` value at that statement.
- **Given** a `try_expression` at statement position (`expr?;`), **when** parsed, **then** the result of `expr` is consumed for its short-circuit effect only — no value is captured.

## Lowering
- **Given** `let v = expr?;`, **when** transpiled, **then** the statement lowers to:
  ```lua
  local __r = expr
  if not __r.ok then return __r end
  local v = __r.value;
  ```
- **Given** `expr?;` at statement position, **when** transpiled, **then** it lowers to:
  ```lua
  local __r = expr
  if not __r.ok then return __r end
  ```
- **Given** multiple `?` in the same function body, **when** transpiled, **then** each use receives a unique local (`__r`, `__r_1`, `__r_2`, …) so the bindings never collide.

## Constraints
- **Given** a `?` operator outside `let` or statement position (e.g. nested inside a larger expression), **when** transpiled, **then** the operator is left in source form — Lua has no IIFE that can short-circuit the outer function, so the user must promote the expression to a `let` first.
- **Given** the enclosing function returns a non-`Result` type, **when** `?` triggers an early return, **then** the runtime returns the `Err` value as-is — type checking that the function's return type is `Result<_, E>` is a future analysis pass.
