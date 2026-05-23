# Feature: block expressions (`{ stmt; stmt; final-expression }`)

**Scope:** Rust-style brace-wrapped sequences that evaluate to their trailing expression.

## Form
- **Given** a brace-wrapped sequence of at least one statement followed by a trailing non-statement expression, **when** parsed in expression position, **then** the construct is a `block_expression` whose `final` field references the trailing expression.
- **Given** `{ value }` in expression position with no preceding statement, **when** parsed, **then** the construct is **not** a `block_expression` — bare brace-wrapped expressions stay as `object_literal` (when their shape fits) or as opaque Lua text. The one-statement floor keeps Lua-flavoured table literals like `{ x = v, y = v }` written in opaque method bodies from accidentally matching block_expression.
- **Given** a block expression nested inside another block expression, **when** parsed, **then** both nodes appear in the AST and inner blocks lower before their enclosing parent.

## Lowering
- **Given** `let x = { let _ = 0; 42 };`, **when** transpiled, **then** the right-hand side lowers to:
  ```lua
  (function() let _ = 0; return 42 end)()
  ```
- **Given** `let x = { let a = 1; a + 1 };`, **when** transpiled, **then** the statements pass through verbatim and the final expression becomes the IIFE's `return`:
  ```lua
  (function() let a = 1; return a + 1 end)()
  ```
- **Given** `let x = { let a = { 1 + 2 }; a };`, **when** transpiled, **then** the inner block lowers first and the outer block wraps the result:
  ```lua
  (function() let a = (function() return 1 + 2 end)(); return a end)()
  ```

## Scope
- **Given** a binding introduced inside a block expression, **when** the IIFE returns, **then** the binding is unreachable from the enclosing scope — Lua's `function() … end` closure boundary handles isolation.

## Constraints
- **Given** a `match`, `range`, or `try` expression inside a block expression, **when** transpiled, **then** the inner construct is not re-lowered for the current pass. Block lowering runs first against the verbatim source; the subsequent passes walk the AST and find inner nodes at their original offsets, which now point inside the rendered IIFE. Author such code outside a block expression (or promote it into a `let` first) until the lowering chain composes.
- **Given** a block expression in a position the grammar treats as a `statement_block` (a function body, a method body, an arrow function body), **when** parsed, **then** the construct stays a `statement_block`. Block expressions only appear in unambiguous expression positions (RHS of `=`, inside parens, argument lists, etc.).
