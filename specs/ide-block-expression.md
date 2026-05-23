# IDE Language Feature: block expressions

**Scope:** editor support for `{ stmt; stmt; final-expression }` blocks in expression position.

## Highlighting
- **Given** a source file containing a block expression, **when** highlighted, **then** the braces fall under the existing `["{" "}"] @punctuation.bracket` rule — no new token kind is needed.
- **Given** statements inside the block, **when** highlighted, **then** they pick up the usual rules for `variable_declaration`, `return_statement`, etc.

## Parsing
- **Given** `{ let _ = 0; 42 }` in expression position, **when** parsed, **then** it becomes a `block_expression` AST node with `final` set to the trailing `42` literal.
- **Given** `{ let a = 1; a + 1 }` in expression position, **when** parsed, **then** the `variable_declaration` appears as a child and `final` points at the trailing `binary_expression`.
- **Given** `{ x }` or `{ x = v, y = v }` where no statement precedes the trailing expression, **when** parsed at expression position, **then** the construct is not a `block_expression` — it falls through to `object_literal` (when shaped like one) or remains opaque. The block grammar requires at least one statement before the trailing expression so Lua-flavoured table literals in opaque bodies aren't disturbed.

## Transpile
- **Given** a `block_expression` at expression position, **when** transpiled, **then** it lowers to a Lua IIFE — `(function() <statements> return <final> end)()` — that preserves both the side-effects of the statements and the trailing-expression value.
- **Given** a nested `block_expression`, **when** transpiled, **then** inner blocks render first; their IIFE text becomes part of the outer block's statement section before the outer IIFE wraps everything.

## Run
- **Given** the IIFE returned by a block expression, **when** invoked, **then** any `local` introduced inside lives only within the IIFE scope.
- **Given** the trailing expression evaluates without side-effects, **when** invoked, **then** the IIFE returns the expression's value and is functionally equivalent to the inlined form.
