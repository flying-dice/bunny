# IDE Language Feature: `Self` type

**Scope:** editor support for `Self` and `self`.

## Highlighting
- **Given** a source file, **when** the identifier `Self` appears, **then** it is coloured as a type keyword.
- **Given** a source file, **when** the identifier `self` appears, **then** it is coloured as a keyword.

## Completion
- **Given** the cursor is in expression position inside an impl method and the prefix is `self.<word>`, **when** completion runs, **then** the implementing struct's fields appear.
- **Given** the cursor is in expression position inside an impl method and the prefix is `Self.<word>`, **when** completion runs, **then** the implementing struct's methods appear.

## Hover
- **Given** the cursor is on `self`, **when** hover runs, **then** the popup shows the parameter's declared struct type.
- **Given** the cursor is on `Self`, **when** hover runs, **then** the popup explains that `Self` is the placeholder for the implementing type.
