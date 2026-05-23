# Zed extension — tsb

Language support for `.tsb` files in [Zed](https://zed.dev). Boots `bunny lsp` as the language server, giving you diagnostics, completion, hover, and goto-definition.

## Install as a dev extension

Until this ships to Zed's extension registry, install it as a local dev extension:

1. (Optional but cleanest) From the repo root, run `bun link` once. That puts `bunny` on `$PATH`, so the extension launches `bunny lsp` directly instead of falling back to `bun run src/cli.ts lsp`.
2. Open Zed.
3. Open the command palette (`cmd-shift-p`) → **zed: install dev extension**.
4. Pick the `zed/` directory of this repo.

Zed compiles the Rust crate to WebAssembly and registers the extension. The first install takes ~15s; subsequent reloads are cached.

## How the LSP gets launched

The extension looks for the server in this order:

1. **`bunny` on `$PATH`** — invoked as `bunny lsp`.
2. **`bun` on `$PATH`** — falls back to `bun run <worktree>/src/cli.ts lsp`. Use this while developing bunny itself.

If neither is available the LSP fails to start; Zed surfaces the error in its log (palette → **zed: open log**).

## What you get

- Diagnostics from the tsb parser + emitter (red squiggles on errors).
- Completion in `#[derive(...)]`, `#[...]` attribute slots, and after `impl … for`.
- Hover on built-in macros, structs, and functions.
- Goto-definition for struct / impl / function references in the current file.

Highlighting reuses the TypeScript tree-sitter grammar, so `struct`/`impl`/`match`/`#[…]` won't be syntax-highlighted as keywords. The rest of the file (which is TS-compatible) highlights correctly.
