# Feature: fmt

**Scope:** canonical formatting for `.neoc` source.

## Form
- **Given** a `.neoc` source string, **when** the formatter runs, **then** it returns a string whose every line uses two-space indentation, has no trailing whitespace, and ends with exactly one newline.
- **Given** a file with tab-indented lines, **when** the formatter runs, **then** every leading tab is replaced with two spaces.
- **Given** a file with three or more consecutive blank lines between top-level declarations, **when** the formatter runs, **then** they collapse to exactly one blank line.
- **Given** an attribute `#[derive(A,B,C)]` with arbitrary inner spacing, **when** the formatter runs, **then** it becomes `#[derive(A, B, C)]` — one space after each comma, no leading or trailing whitespace inside the parens.
- **Given** any input, **when** the formatter is applied a second time, **then** the result is identical to the first pass (idempotent).

## Scope
- **Given** an opaque body region (Lua code inside method bodies and top-level gaps), **when** the formatter runs, **then** structure is preserved; only trailing whitespace and tab-indentation are touched.
- **Given** any `#[...]` attribute other than `derive`, **when** the formatter runs, **then** its payload is left untouched.

## CLI
- **Given** the user runs `neoc fmt -s <glob>...`, **when** the command executes, **then** every matching `.neoc` file is read, formatted, and rewritten in place only when the output differs from disk.
- **Given** `-w`/`--watch` is passed, **when** the command runs, **then** the process stays resident and reformats files on change.

## Limitations
- No syntactic rewriting, no reordering of declarations, no splitting of long attribute lists or signatures.
- The formatter does not parse the source; it operates purely on text. Malformed neoc still round-trips through `formatSource` without errors.
