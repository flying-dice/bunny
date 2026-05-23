# IDE Language Feature: `?` postfix operator

**Scope:** editor support for the `?` postfix operator on `Result<T, E>`.

## Highlighting
- **Given** a source file, **when** `expr?` appears, **then** the `?` token is coloured as an operator via the `(try_expression "?" @operator)` rule.
- **Given** a ternary `cond ? a : b` on the same line as a `try_expression`, **when** highlighted, **then** the two `?` tokens are distinguished by their containing node — try wins inside `try_expression`, the shared operator group highlights the ternary one.

## Completion
- **Given** the cursor sits after a call expression that returns `Result<_, _>`, **when** completion runs, **then** `?` appears as a one-character snippet that wraps the call in a `try_expression`.

## Hover
- **Given** the cursor sits on a `?` inside a `try_expression`, **when** hover runs, **then** the popup explains that the operator short-circuits the enclosing function on `Err`.

## Parsing
- **Given** `expr?`, **when** parsed, **then** it becomes a `try_expression` AST node whose single unnamed child is the inner expression.
- **Given** an ambiguous `foo ? a : b`, **when** parsed, **then** the GLR engine selects `ternary_expression` because a complete parse requires the `:` branch; `foo?` standing alone selects `try_expression`.

## Transpile
- **Given** `let v = expr?;`, **when** transpiled, **then** the variable_declaration rewrites to a `local __r = expr` plus a guarded `if not __r.ok then return __r end` plus a `local v = __r.value;` binding.
- **Given** `expr?;` at statement position, **when** transpiled, **then** the bare expression rewrites to the same guarded local without a value capture.
- **Given** several `?` operators in one body, **when** transpiled, **then** each pass receives a fresh `__r`, `__r_1`, `__r_2`, … name.

## Run
- **Given** a transpiled `expr?`, **when** `expr` returns `{ ok = true, value = v }`, **then** execution proceeds with the `Ok` value in scope.
- **Given** a transpiled `expr?`, **when** `expr` returns `{ ok = false, error = e }`, **then** the enclosing function returns the `Err` value immediately.
