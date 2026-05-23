# Feature: range expressions (`a..b`, `a..=b`)

**Scope:** Rust-style numeric ranges at expression position.

## Form
- **Given** two expressions joined by `..`, **when** parsed, **then** the construct is a `range_expression` with `start` and `end` operands, exclusive on the right.
- **Given** two expressions joined by `..=`, **when** parsed, **then** the construct is a `range_expression`, inclusive on the right.
- **Given** a chain like `a..b..c`, **when** parsed, **then** the operator is left-associative — `(a..b)..c`.
- **Given** a `range_expression` at expression position, **when** transpiled, **then** it lowers to a Lua sequence-building IIFE that produces a 1-indexed array of the integers in the range.

## Lowering
- **Given** `let xs = 0..3;`, **when** transpiled, **then** the right-hand side lowers to:
  ```lua
  (function() local r = {} for i = 0, 3 - 1 do r[#r + 1] = i end return r end)()
  ```
- **Given** `let xs = 0..=3;`, **when** transpiled, **then** the upper bound passes through unchanged:
  ```lua
  (function() local r = {} for i = 0, 3 do r[#r + 1] = i end return r end)()
  ```
- **Given** `let xs = a..b;`, **when** transpiled, **then** the operand text is preserved verbatim and only the `end - 1` adjustment is added:
  ```lua
  (function() local r = {} for i = a, b - 1 do r[#r + 1] = i end return r end)()
  ```

## Interaction with Lua-style concat in opaque bodies
- **Given** a body expression like `self.x .. "," .. self.y` (Lua string concat written verbatim in a neoc method body), **when** transpiled, **then** the rewrite is skipped — the verbatim `..` is preserved as Lua concat. A range with at least one string-literal operand is treated as concat, not a range, so existing bodies that use Lua's `..` keep working.

## Constraints
- **Given** the right-hand side of `for x in <range> { … }`, **when** parsed, **then** the construct is left to a follow-up. The `for` loop grammar isn't in this pass; only the expression-position lowering ships now.
- **Given** the operands are not integers at runtime, **when** the IIFE executes, **then** Lua's numeric `for` raises an arithmetic error. Type checking that the operands are `number` is a future analysis pass.
