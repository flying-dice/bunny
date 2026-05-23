# IDE Language Feature: tuple-struct (newtype) shorthand

**Scope:** editor support for `struct Foo(T)` declarations.

## Highlighting
- **Given** a tuple-struct declaration, **when** highlighting runs, **then** `struct` is coloured as a keyword.
- **Given** a tuple-struct declaration, **when** highlighting runs, **then** the struct's name is coloured as a type identifier.
- **Given** a tuple-struct declaration whose payload is a primitive type (e.g. `string`), **when** highlighting runs, **then** the payload is coloured as a builtin type.
- **Given** a tuple-struct declaration whose payload is a named type (e.g. `Product`), **when** highlighting runs, **then** the payload is coloured as a type identifier.

## Completion
- **Given** the cursor is at the start of a declaration, **when** completion runs, **then** `struct` appears in the suggestion list — the same suggestion that drives the block form.
- **Given** the cursor sits inside the parens of a tuple-struct declaration, **when** completion runs, **then** every visible type name appears (primitive and user-defined).

## Hover
- **Given** the cursor is on a tuple-struct's name, **when** hover runs, **then** the popup shows the signature (`struct Foo(T)`) plus any `///` doc comment.

## Goto definition
- **Given** the cursor is on a tuple-struct's name used in another module, **when** goto-definition runs, **then** the editor jumps to the `struct Foo(T)` declaration.

## Parsing
- **Given** `struct Foo(T)` for some valid type `T`, **when** parsed, **then** it is recognised as a tuple-struct declaration node.
- **Given** `struct Foo()` with no payload type, **when** parsed, **then** an error is reported and the rest of the file still parses.
- **Given** `struct Foo(T, U)` with multiple payload types, **when** parsed, **then** an error is reported — this commit ships single-payload only.

## Transpile
- **Given** a valid tuple-struct declaration, **when** transpiled, **then** it produces the same Lua shape as the block form `struct Foo { value: T }` — a Lua table assigned to the struct's name with a `.new(data)` factory that stamps the `_struct` brand.

## Run
- **Given** a transpiled tuple-struct, **when** `.new({ value = x })` is called, **then** the value carries the runtime `_struct` brand.
