# IDE Language Feature: signature help

**Scope:** editor support for `textDocument/signatureHelp` on `.neoc` files.

## Capability
- **Given** the LSP `initialize` handshake, **when** the server responds, **then** the capabilities advertise `signatureHelpProvider: { triggerCharacters: ["(", ","] }`.

## Request
- **Given** the user types `(` or `,` inside a call, **when** the editor sends `textDocument/signatureHelp`, **then** the server walks back to the enclosing `<callee>(` and returns a `SignatureHelp` with one `SignatureInformation`.
- **Given** the cursor sits between `(` and `)` of a call to a known function, struct, or impl method, **when** signature help is requested, **then** `signatures[0].label` is the callee's verbatim signature and `activeParameter` is the top-level comma count before the cursor.
- **Given** the cursor is not inside a call, **when** signature help is requested, **then** the server returns `null`.

## Callee resolution
- **Given** a bare identifier `foo(`, **when** resolving, **then** the server consults the document's `function` declarations first and falls back to the workspace symbol table.
- **Given** a `Product.new(` form for a struct named `Product`, **when** resolving, **then** the server synthesises `Product.new(data: Product): Product` from the struct declaration in either the document or the workspace.
- **Given** a `Foo.bar(` form where `Foo` has an inherent impl block declaring `bar`, **when** resolving, **then** the server uses the impl method's verbatim signature.

## Active parameter
- **Given** an argument list `foo(a, b, c)`, **when** the cursor sits after the second comma, **then** `activeParameter` is `2`.
- **Given** a nested call `outer(inner(), x)`, **when** the cursor sits inside `inner(`, **then** the innermost call's signature is returned, not the outer one.
- **Given** nested brackets `take({ a, b }, c)`, **when** counting commas, **then** commas inside the inner braces are ignored.

## Limitations
- Only `Type.method(…)` and bare-function callees surface a method signature. `value.method(…)` against a typed binding isn't resolved yet.
- The walker doesn't track block comments or backtick string literals — false positives are possible if those forms enclose unbalanced parentheses.
- One signature per call only; overload sets are not modelled.
