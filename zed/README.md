# Zed extension — tsb

Language support for `.tsb` files in [Zed](https://zed.dev). Boots `bunny lsp` as the language server, giving you diagnostics, completion, hover, and goto-definition.

## Install as a dev extension

Until this ships to Zed's extension registry, install it as a local dev extension:

1. (Optional but cleanest) From the repo root, run `bun link` once. That puts `bunny` on `$PATH`, so the extension launches `bunny lsp` directly instead of falling back to `bun run src/cli.ts lsp`.
2. Materialise the local grammar fork:
   ```bash
   ./zed/setup-grammar.sh
   ```
   This fetches `tree-sitter-typescript` at a pinned commit, renames it internally to `tsb`, and stores it as a self-contained git repo under `zed/grammars-src/tsb/` (gitignored). The Zed extension references it via `file://` so it can't collide with the editor's built-in TypeScript grammar.
3. Open Zed.
4. Open the command palette (`cmd-shift-p`) → **zed: install dev extension**.
5. Pick the `zed/` directory of this repo.

Zed compiles the Rust crate to WebAssembly, clones the local grammar via `file://`, and registers the extension.

> The `file://` path in `extension.toml` is absolute and machine-specific (`/Users/jonathanturnock/...`). Anyone else cloning this repo will need to edit that path to match their checkout, or we'll switch to a publicly-hosted fork later.

### Testing the highlight queries

Editing `languages/tsb/highlights.scm` and round-tripping through `zed: install dev extension` is slow and Zed aggressively caches the loaded queries. Iterate locally instead:

```bash
./zed/test-highlights.sh
```

The script runs `tree-sitter query` against a tsb fixture and asserts that specific tokens land in specific captures. Edit the `EXPECTED` block at the top of the script to add new assertions; failures print the actual captures for the offending position.

**One-time setup:** the `setup-grammar.sh` step also has to have been run (the test uses the same vendored grammar Zed does). Tree-sitter's `query` subcommand resolves the grammar from its current working directory, so the script `cd`s into the parser dir before each query call.

### Grammar history (why we vendor)

Four versions of the grammar story landed before `v0.5.0` settled it:

- **`v0.1.0`** — declared `[grammars.typescript]`. Same name as Zed's built-in TS grammar; collision broke `.ts` highlighting editor-wide.
- **`v0.2.0`** — renamed to `[grammars.tsb]`. Tree-sitter's compiler expects the parser's exported C symbol (`tree_sitter_<name>`) to match, but the upstream source exports `tree_sitter_typescript`. Install errored with `failed to compile grammar 'tsb'`.
- **`v0.3.0`** — dropped the grammar entirely. Safe; `.tsb` files rendered as plain text.
- **`v0.4.0`** — tried `grammar = "typescript"` in the language config without redeclaring it. Zed's built-in grammar isn't reachable from other extensions; no highlighting.
- **`v0.5.0`** — vendor a renamed fork locally (`zed/setup-grammar.sh`). Real highlighting via the renamed `tree_sitter_tsb` symbol; can't collide with built-in.

### Recovering from a broken v0.1.0 / v0.2.0 install

1. Open the extensions panel (`cmd-shift-x` / **zed: extensions**).
2. Uninstall the `tsb` extension.
3. Quit Zed and reopen (drops any cached grammar state).
4. Run `./zed/setup-grammar.sh` if you haven't already.
5. Re-install via **zed: install dev extension** pointing at this `zed/` directory.

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
