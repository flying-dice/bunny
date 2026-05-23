# Feature: inlay hints

**Scope:** non-editable ghost-text labels rendered inline next to call-site arguments to name the parameter each value fills.

## Form
- **Given** a call site `<callee>(arg1, arg2, …)` in a `.neoc` source file, **when** inlay hints are requested for a range covering the call, **then** the result contains one hint per recognised argument, anchored to the argument's first non-whitespace byte, labelled `<paramName>:`.
- **Given** a struct factory call `Foo.new(<value>)`, **when** hints are requested, **then** a single hint with label `data:` is emitted before `<value>`.
- **Given** a call to an identifier the workspace doesn't resolve to a function, struct `.new`, or impl method, **when** hints are requested, **then** no hints are emitted for that call.

## Scope
- **Given** a function declaration `function f(a: T, b: T)`, **when** hints are computed, **then** the parameter list inside the declaration header receives no hints — only call sites are annotated.
- **Given** an argument position whose start offset falls outside the requested range, **when** hints are computed, **then** that hint is omitted.
- **Given** a call inside a string literal or `//` line comment, **when** hints are computed, **then** the scanner skips the call.

## Limitations
- The scan is purely textual: it does not understand scope, shadowing, or imports. Two same-named functions in different files both resolve to the first hit.
- Only one dotted level is recognised in the callee (`Type.member`). Deeper chains (`a.b.c(…)`) are ignored.
- When the argument count exceeds the parameter count (variadic-looking calls), the extra arguments receive no hints.
