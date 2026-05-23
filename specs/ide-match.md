# IDE Language Feature: `match` expression

**Scope:** editor support for `match` expressions.

## Highlighting
- **Given** a source file, **when** `match` appears, **then** it is coloured as a keyword.
- **Given** a match arm with `=>`, **when** highlighting runs, **then** the arrow is coloured as an operator.
- **Given** a struct-pattern arm, **when** highlighting runs, **then** the struct name is coloured as a type.

## Completion
- **Given** the cursor is at the start of an expression, **when** completion runs, **then** `match` appears in the suggestion list.
- **Given** the cursor is inside an arm's left-hand side and the scrutinee's type is a known struct union, **when** completion runs, **then** every union member's struct pattern appears as a snippet.

## Hover
- **Given** the cursor is on a struct pattern's name, **when** hover runs, **then** the popup shows the matched struct's signature and fields.

## Parsing
- **Given** a `match` expression with at least one arm, **when** parsed, **then** it becomes a `match_expression` AST node with a list of `match_arm` children.
- **Given** a match arm missing the `=>`, **when** parsed, **then** an error is reported and the rest of the file still parses.

## Transpile
- **Given** a `match` expression, **when** transpiled, **then** it is lowered to an IIFE that runs each arm's condition in order and throws when no arm matches.

## Run
- **Given** a transpiled `match`, **when** evaluated with a value matching one of the arms, **then** the corresponding right-hand side is returned with all bindings in scope.
- **Given** a transpiled `match`, **when** no arm matches, **then** a `match: no arm matched` runtime error is thrown.
