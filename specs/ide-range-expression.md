# IDE Language Feature: range expressions

**Scope:** editor support for `..` and `..=` range expressions.

## Highlighting
- **Given** a source file, **when** `a..b` appears, **then** the `..` token is coloured as an operator via the `(range_expression ".." @operator)` rule.
- **Given** an inclusive range `a..=b`, **when** highlighted, **then** the `..=` token is coloured as an operator via the `(range_expression "..=" @operator)` rule.

## Parsing
- **Given** `a..b`, **when** parsed, **then** it becomes a `range_expression` AST node with `start` and `end` fields pointing at the operands.
- **Given** `a..=b`, **when** parsed, **then** the same shape applies and the inclusive-versus-exclusive distinction is recovered from the raw text between the operand spans (anonymous tokens are stripped from the typed AST).
- **Given** a chain `a..b..c`, **when** parsed, **then** it becomes `(a..b)..c` — `range_expression` is left-associative.

## Transpile
- **Given** `0..3` at expression position, **when** transpiled, **then** it lowers to a Lua IIFE that builds a 1-indexed table whose values are the integers in `[0, 3)`.
- **Given** `0..=3`, **when** transpiled, **then** the IIFE uses an inclusive `for i = 0, 3 do` and the resulting table covers `[0, 3]`.
- **Given** `a..b` where neither operand is a string literal, **when** transpiled, **then** the operand text passes through verbatim and only the `end - 1` adjustment is appended.
- **Given** a `..` whose operand is a string literal (Lua-style concat written in an opaque body), **when** transpiled, **then** the rewrite is skipped and the verbatim `..` survives as Lua string concatenation.

## Run
- **Given** the IIFE returned by a range expression, **when** indexed, **then** `xs[1]` is the start value and `#xs` is the length of the produced sequence.
- **Given** the exclusive form, **when** `start == end`, **then** the produced table is empty.
- **Given** the inclusive form, **when** `start == end`, **then** the produced table holds a single element.
