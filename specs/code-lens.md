# Feature: code lens

**Scope:** clickable text labels rendered above top-level declarations to surface one-shot actions (running a test, jumping to references) without leaving the source view.

## Form
- **Given** a function annotated with `#[test]`, **when** code lenses are requested for the file, **then** the result includes a lens with title `▶ Run test`, command `neoc.runTest`, and the function name as the sole argument.
- **Given** a struct, trait, or function declaration, **when** code lenses are requested, **then** the result includes a lens with title `<N> reference[s]`, command `neoc.showReferences`, and `{ uri, position }` pointing at the declaration's name as the argument.
- **Given** a declaration with no external uses, **when** the reference count is computed, **then** the lens title is `0 references` — the declaration's own name token is excluded from the count.

## Anchoring
- **Given** any emitted lens, **when** the editor renders it, **then** the `range` covers the declaration's first line — from column 0 to the end of that line.
- **Given** a function carrying both `#[test]` and an external call site, **when** lenses are emitted, **then** the function receives two lenses: the run-test action and the references count, in that order.

## Counting
- **Given** a struct declared once and referenced twice in the same file, **when** the references lens is built, **then** the title is `2 references`.
- **Given** a struct declared in the open document and referenced once across a workspace root, **when** the lens is built, **then** the count sums in-document and cross-file textual occurrences (declaration excluded).

## Limitations
- The reference count is a textual scan: it cannot tell apart two same-named symbols and skips occurrences inside `//` comments and string literals only.
- The workspace scan is capped at the first 50 roots; counts in workspaces beyond that bound are lower-bounds, not exact.
- Lens commands (`neoc.runTest`, `neoc.showReferences`) are surfaced but not yet handled — the editor will dispatch them and the server replies with method-not-found.
