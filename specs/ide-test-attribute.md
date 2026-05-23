# IDE Language Feature: `#[test]` attribute

**Scope:** editor support for `#[test]` on exported functions.

## Highlighting
- **Given** a `#[test]` attribute, **when** highlighting runs, **then** the entire span is coloured as one attribute token.

## Completion
- **Given** the cursor is at the start of a `#[…]` attribute above a function, **when** completion runs, **then** `test` appears in the suggestion list alongside other function-attribute macros.

## Hover
- **Given** the cursor is on the `test` macro name, **when** hover runs, **then** the popup describes the macro as registering the function with the module's `__neoc_tests` table for `neoc test` to discover.

## Parse
- **Given** `#[test]` directly above an exported function, **when** the parser walks the source, **then** the attribute attaches to the function's `attrs` list as a zero-argument `#[name]` attribute.

## Transpile
- **Given** a function annotated with `#[test]`, **when** transpiled, **then** the emitted module contains both the function body and an `__neoc_tests` registration line for it.

## Run
- **Given** a workspace containing `#[test]` functions, **when** the user invokes `neoc test`, **then** every matching `.neoc` is compiled and each registered test runs under `luau`, printing `PASS` / `FAIL` per test and a final summary `<passed> passed, <failed> failed`.
