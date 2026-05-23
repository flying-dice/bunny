# Zed extension — neoc

Language support for `.neoc` files in [Zed](https://zed.dev). Boots `neoc lsp` as the language server, giving you diagnostics, completion, hover, goto-definition, and a quick-fix that stubs missing trait methods.

## Install as a dev extension

Until this ships to Zed's extension registry, install it as a local dev extension:

1. (Optional but cleanest) From the repo root, run `bun link` once. That puts `neoc` on `$PATH`, so the extension launches `neoc lsp` directly instead of falling back to `bun run src/cli.ts lsp`.
2. Build the tree-sitter grammar:
   ```bash
   ./zed/setup-grammar.sh
   ```
   Runs `tree-sitter generate` + `tree-sitter build --wasm` against the from-scratch grammar in `zed/tree-sitter-neoc/`, leaves the parser source as a self-contained git repo so Zed can clone it via `file://`.
3. Open Zed.
4. Open the command palette (`cmd-shift-p`) → **zed: install dev extension**.
5. Pick the `zed/` directory of this repo.

Zed compiles the Rust crate to WebAssembly, clones the local grammar via `file://`, and registers the extension.

> The `file://` path in `extension.toml` is absolute and machine-specific (`/Users/jonathanturnock/...`). Anyone else cloning this repo will need to edit that path to match their checkout, or we'll switch to a publicly-hosted fork later.

### Testing the highlight queries

Editing `languages/neoc/highlights.scm` and round-tripping through `zed: install dev extension` is slow and Zed aggressively caches the loaded queries. Iterate locally instead:

```bash
./zed/test-highlights.sh
```

The script runs `tree-sitter query` against a neoc fixture and asserts that specific tokens land in specific captures. Edit the `EXPECTED` block at the top of the script to add new assertions; failures print the actual captures for the offending position.

**One-time setup:** the `setup-grammar.sh` step also has to have been run (the test uses the same grammar Zed does). Tree-sitter's `query` subcommand resolves the grammar from its current working directory, so the script `cd`s into the parser dir before each query call.

## How the LSP gets launched

The extension looks for the server in this order:

1. **`neoc` on `$PATH`** — invoked as `neoc lsp`.
2. **`bun` on `$PATH`** — falls back to `bun run <worktree>/src/cli.ts lsp`. Use this while developing neoc itself.

If neither is available the LSP fails to start; Zed surfaces the error in its log (palette → **zed: open log**).

## What you get

- Diagnostics from the neoc parser + emitter.
- Completion in `#[derive(...)]`, `#[...]` attribute slots, after `impl … for`, and after `self.` / `Self.` / `<param>.` for struct field access.
- Hover on built-in macros, structs, traits, and functions.
- Goto-definition for struct / trait / function references in the current file or workspace.
- A `quickfix` code action that stubs every missing required method on an `impl Trait for X { }` block.

Syntax highlighting comes from a from-scratch `tree-sitter-neoc` grammar that lives under `zed/tree-sitter-neoc/`. It knows about `struct`, `impl`, `trait`, `match`, `#[…]`, `Self`, and the rest of the declaration surface; method bodies and the gaps between declarations are treated as opaque text (where the user writes Lua).
