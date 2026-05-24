# Feature: `#[…]` attribute macros

**Scope:** the `#[…]` attribute system that augments declarations at compile time.

## Position
- **Given** a `#[…]` block, **when** it sits immediately before a struct, trait, impl, function, or struct field, **then** the attribute attaches to that declaration.
- **Given** a `#[a, b, c]` block, **when** parsed, **then** it is treated as three separate attributes attaching to the same declaration.

## Form
- **Given** an attribute, **when** it has the shape `<name>(args…)`, **then** `<name>` is the macro and `args…` are its compile-time arguments.
- **Given** an attribute without parentheses, **when** parsed, **then** it is a flag-style invocation with no arguments.

## Macros
- **Given** an attribute name, **when** resolved, **then** it matches a registered macro of one of three kinds: derive, field-constraint, or function-attribute.
- **Given** an attribute name with no matching macro, **when** compiled, **then** a diagnostic is emitted at the attribute's span.

## Output
- **Given** a macro's `emit`, **when** it runs at compile time, **then** the macro may add code to the struct's const, emit module-level snippets, or contribute entries to a project-wide table that the macro itself names.
- **Given** a macro that targets a struct's fields, **when** it runs, **then** its check is woven into the struct's emitted `.new` constructor.
