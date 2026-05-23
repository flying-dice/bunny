# IDE Language Feature: `impl` keyword

**Scope:** editor support for `impl` blocks.

## Highlighting
- **Given** a source file, **when** `impl` and `for` appear, **then** both are coloured as keywords.
- **Given** an impl block, **when** highlighting runs, **then** the trait name and target struct name are coloured as types.
- **Given** an impl method, **when** highlighting runs, **then** the method name is coloured as a function and `self` is coloured as a keyword.

## Completion
- **Given** the cursor is at the start of a declaration, **when** completion runs, **then** `impl` appears in the suggestion list.
- **Given** the cursor is inside an `impl Trait for X { … }` body and the trait has unimplemented required methods, **when** completion runs, **then** only those methods appear as snippets that expand into a full stub.
- **Given** the cursor is inside an impl method body and the text is `self.<word>`, **when** completion runs, **then** the target struct's fields appear.

## Hover
- **Given** the cursor is on the trait name in an impl block, **when** hover runs, **then** the popup shows the trait's signature and doc.
- **Given** the cursor is on a method name in an impl block, **when** hover runs, **then** the popup shows the method's signature.

## Diagnostics
- **Given** an `impl Trait for X` block missing required trait methods, **when** the file is parsed, **then** a warning is reported on the `impl` header line listing the missing names.

## Code actions
- **Given** the `impl Trait for X` block has missing required methods, **when** the user invokes the quick-fix, **then** a single edit inserts a stub for each missing method between the existing braces.

## Parsing
- **Given** an `impl` block, **when** the trait name and target struct are present, **then** the parser produces an `ImplDecl` with a `traitName` set.
- **Given** an inherent `impl`, **when** there is no `for`, **then** the parser produces an `ImplDecl` with `traitName` unset.

## Transpile
- **Given** a valid `impl` block, **when** transpiled, **then** the methods are added to the target struct's emitted const.

## Run
- **Given** a transpiled `impl`, **when** a method is invoked on an instance, **then** the corresponding TypeScript function runs.
