# Feature: `#[test]` attribute

**Scope:** `#[test]` on an exported function with no parameters and a `void` return.

## Form
- **Given** a function annotated with `#[test]`, **when** compiled, **then** the function emits normally as a Lua function.
- **Given** a function annotated with `#[test]`, **when** compiled, **then** the module appends a `__neoc_tests` registration entry mapping the function's name to its callable.

## Registration shape
- **Given** a single `#[test]` function `foo`, **when** the module emits, **then** the appended block contains `__neoc_tests = __neoc_tests or {}` followed by `__neoc_tests[#__neoc_tests + 1] = { name = "foo", run = foo }`.
- **Given** multiple `#[test]` functions, **when** the module emits, **then** each function gets its own registration entry in source order.

## Driver
- **Given** a project containing `#[test]` functions, **when** `neoc test` runs, **then** every `.neoc` matching the source glob compiles and each registered test runs under `luau` (or `lua` as fallback) via `pcall`.
- **Given** a registered test, **when** the test body runs without error, **then** the driver prints `PASS <name>`.
- **Given** a registered test, **when** the test body raises, **then** the driver prints `FAIL <name>: <error>` and `neoc test` exits non-zero.
- **Given** a completed run, **when** the driver finishes, **then** it prints `<passed> passed, <failed> failed`.

## Errors
- **Given** no Lua runtime on `PATH`, **when** `neoc test` runs, **then** the CLI prints a clear message asking the user to install luau via `brew install luau`.
