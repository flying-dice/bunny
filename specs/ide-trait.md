# IDE Langauge Feature: `trait` keyword

**Scope:** editor support for the `trait` keyword

## Highlighting
- **Given** a source file open in the editor, **when** the text `trait` appears as a keyword, **then** it is colored as a keyword.

## Completion
- **Given** the cursor is at the start of a declaration, **when** the user triggers completion, **then** `trait` appears in the suggestion list.
- **Given** the user has typed `tra`, **when** completion runs, **then** `trait` is offered as a match.

## Parsing
- **Given** a declaration beginning with `trait`, **when** the file is parsed, **then** it is recognized as a trait definition.
- **Given** a `trait` with no name after it, **when** the file is parsed, **then** an error is reported and the rest of the file still parses.

## Transpile
- **Given** a valid `trait` definition, **when** the file is transpiled, **then** it produces the corresponding Lua representation.

## Run
- **Given** a transpiled `trait`, **when** the program runs, **then** types implementing it can use its members.
