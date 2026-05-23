# IDE Language Feature: inlay hints

**Scope:** editor support for `textDocument/inlayHint` on `.neoc` files.

## Capability
- **Given** the LSP `initialize` handshake, **when** the server responds, **then** the capabilities advertise `inlayHintProvider: true`.

## Request
- **Given** the user opens a `.neoc` file, **when** the editor sends `textDocument/inlayHint` with the visible range, **then** the server returns an array of `InlayHint` objects, one per call-site argument whose callee resolves to a known function, struct `.new`, or impl method.
- **Given** the visible range covers no resolvable call sites, **when** the editor requests hints, **then** the server returns an empty array.

## Hint shape
- **Given** an argument at offset `o` of a recognised call, **when** the server emits a hint, **then** `position` is the LSP `Position` for `o`, `label` is the string `<paramName>:`, `kind` is `2` (`Parameter`), and `paddingRight` is `true`.
- **Given** a struct factory `Foo.new(<value>)`, **when** the server emits hints, **then** the single hint's label is `data:`.

## Filtering
- **Given** a candidate call site sits inside the parameter list of a function or method declaration header, **when** the server scans, **then** the scanner suppresses hints for that paren group.
- **Given** an occurrence sits inside a `//` comment or quoted string literal, **when** the server scans, **then** the occurrence is omitted from the result.

## Limitations
- No semantic disambiguation: a struct named `Foo` and a function named `Foo` both resolve at the same callee text.
- Only single-dotted callees (`Type.member`) are recognised; deeper chains are ignored.
- Variadic / extra arguments past the declared parameter count receive no hint.
