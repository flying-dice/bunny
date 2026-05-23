# Feature: signature help

**Scope:** describe the signature of the function or method being called at the cursor's position, plus which parameter the cursor is currently filling.

## Form
- **Given** the cursor sits between the parentheses of a call expression `foo(|)`, **when** signature help is requested, **then** the result is a single `SignatureInformation` whose `label` is the callee's full signature and whose `activeParameter` is `0`.
- **Given** the cursor sits after one or more commas at the call's top level (`foo(1, |)`), **when** signature help is requested, **then** `activeParameter` equals the number of top-level commas between the opening `(` and the cursor.
- **Given** the cursor is not inside any call, **when** signature help is requested, **then** the result is `null`.

## Callees
- **Given** a call to a top-level `function foo(…) { … }`, **when** signature help is requested, **then** the signature comes from the function's verbatim declared signature.
- **Given** a call to a struct factory `Product.new(…)` for a struct `Product { … }`, **when** signature help is requested, **then** the signature is `Product.new(data: Product): Product`.
- **Given** a call to an inherent impl method `Foo.bar(…)`, **when** signature help is requested, **then** the signature comes from the impl method's verbatim declared signature.

## Argument counting
- **Given** an argument list that contains nested parentheses, brackets, or braces, **when** signature help counts commas, **then** only commas at the same paren depth as the enclosing call are counted.
- **Given** an argument list that contains string literals or line comments, **when** signature help walks back, **then** characters inside those regions are skipped.

## Limitations
- The receiver in `value.method(…)` is not yet resolved to its struct; only `Type.method(…)` and bare-function forms surface a signature.
- Generic instantiation isn't inspected — the signature is reported verbatim, exactly as declared.
- Only one signature is ever returned; overload sets aren't modelled because neoc doesn't have overloads.
