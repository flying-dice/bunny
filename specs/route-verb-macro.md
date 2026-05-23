# Feature: HTTP route verb macros

**Scope:** `#[get], #[post], #[put], #[patch], #[delete], #[head], #[options]` on exported functions.

## Form
- **Given** an `#[<verb>("path")]` attribute on an exported function, **when** compiled, **then** the function is registered as the handler for that HTTP verb and path.
- **Given** a path with `:param` segments, **when** compiled, **then** each named segment binds to a same-name parameter in the handler.

## Body parameters
- **Given** the verb is `POST`, `PUT`, or `PATCH` and the handler declares a non-path parameter, **when** compiled, **then** the macro treats it as the request body.
- **Given** a body parameter whose type is a single struct identifier, **when** the route runs, **then** the JSON body is validated via `<Struct>.new(body)` before the handler is invoked.
- **Given** a body parameter whose type is not a struct, **when** the route runs, **then** the JSON body is passed through as a typed cast with no runtime check.

## Query parameters
- **Given** a handler parameter that isn't a path segment and isn't a body, **when** compiled, **then** the macro forwards `URL.searchParams.get(name)` to the handler.

## Output
- **Given** a registered route, **when** the module emits, **then** `routes` is populated with a Bun-serve-ready handler object for the path.
- **Given** a registered route, **when** the module emits, **then** `openapi` is populated with the OpenAPI operation for the path.
- **Given** a registered route, **when** the module emits, **then** `client` is populated with a typed client function that calls the route.

## Errors
- **Given** a `.new` validation failure inside the route adapter, **when** thrown, **then** the underlying `ConstraintError` propagates to the framework.
