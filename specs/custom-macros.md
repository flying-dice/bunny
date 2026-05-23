# Feature: User-authored macros (`--macro`)

**Scope:** loading user-authored macros into the compiler via the `--macro <path>` CLI flag.

## Loading
- **Given** `neoc build --macro ./macros.ts`, **when** the compiler starts, **then** the module is dynamically imported and every macro it exports is registered before codegen.
- **Given** a macro module, **when** it exports a `default` value, **then** the value may be a single `Macro` or an array of `Macro`.
- **Given** a macro module that also exports `macros` (array), **when** loaded, **then** those macros are registered in addition to the default export.
- **Given** `--macro` is repeated, **when** the compiler starts, **then** every listed module is loaded in argument order.
- **Given** a path that fails to import, **when** the compiler starts, **then** the import error surfaces to the caller and the build aborts.

## Authoring
- **Given** a user-authored macro, **when** it implements `DeriveMacro`, **then** it emits one Lua function definition attached to the struct's table.
- **Given** a user-authored macro, **when** it implements `FieldConstraintMacro`, **then** it emits guard statements woven into the target struct's `.new` body.
- **Given** a user-authored macro, **when** it implements `FunctionAttrMacro`, **then** it may replace the function body or push module-level state via `ctx.appendModule` / `ctx.appendToRecord`.
- **Given** a user-authored macro, **when** authored, **then** types are imported from `@flying-dice/neoc-compiler/macro` (type-only — zero runtime dependency on neoc).

## Composition
- **Given** a user-authored macro with the same name as a built-in, **when** registered, **then** the user macro replaces the built-in for the duration of the build.
- **Given** user-authored macros across multiple `--macro` modules, **when** registered, **then** later registrations win on name collision.
- **Given** an attribute whose name matches no registered macro (built-in or user), **when** compiled, **then** a diagnostic is reported at the attribute's span.

## Example
- **Given** `#[derive(JsonString)]` defined as a user-authored derive macro, **when** applied to a struct, **then** the emitted Lua includes a `Foo.toJsonString(self)` method that returns a JSON-encoded string.
- **Given** `#[email]` defined as a user-authored field-constraint macro, **when** applied to a string field, **then** the emitted `Foo.new` rejects values that do not match a basic email pattern.
