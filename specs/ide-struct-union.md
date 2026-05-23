# IDE Language Feature: Struct unions

**Scope:** editor support for struct-union types declared as `type X = A | B | C`.

## Highlighting
- **Given** a `type` alias declaring a struct union, **when** highlighting runs, **then** the type name is coloured as a type and each variant struct name is coloured as a type identifier.
- **Given** the `|` between variants, **when** highlighting runs, **then** it is coloured as an operator.

## Completion
- **Given** the cursor is in a type-position annotation, **when** completion runs, **then** the union's type alias and every member struct appear in the suggestion list.

## Hover
- **Given** the cursor is on a struct-union type alias, **when** hover runs, **then** the popup lists each variant.

## Transpile
- **Given** a `type X = A | B | C` declaration, **when** transpiled, **then** the alias itself emits no Lua — discrimination at runtime relies on each variant's `_struct` brand.

## Run
- **Given** a transpiled union, **when** an instance is matched on its struct identity, **then** the `_struct` brand on the runtime value drives discrimination.
