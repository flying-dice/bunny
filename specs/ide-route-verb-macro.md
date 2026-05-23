# IDE Language Feature: HTTP route verb macros

**Scope:** editor support for `#[get], #[post], #[put], #[patch], #[delete], #[head], #[options]`.

## Highlighting
- **Given** a `#[<verb>("path")]` attribute, **when** highlighting runs, **then** the entire span is coloured as one attribute token.

## Completion
- **Given** the cursor is at the start of a `#[…]` attribute above a function, **when** completion runs, **then** every HTTP verb appears in the suggestion list (`get`, `post`, `put`, `patch`, `delete`, `head`, `options`).

## Hover
- **Given** the cursor is on a verb macro name, **when** hover runs, **then** the popup shows the resulting route's method and the body / param contract.

## Diagnostics
- **Given** a `:param` path segment, **when** the handler has no parameter of that name, **then** a diagnostic is reported on the attribute's span.

## Transpile
- **Given** a function annotated with a route verb macro, **when** transpiled, **then** the file emits `routes`, `openapi`, and `client` entries for the route.

## Run
- **Given** a transpiled route, **when** the server receives a request matching the path and method, **then** the JSON body is validated via the body parameter's struct constructor (when applicable) before the handler runs.
