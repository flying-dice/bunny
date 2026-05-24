# Plan — Port `neoc-compiler` to Rust

Goal: replace the TypeScript/Bun compiler in this repo with a Rust implementation that lives **alongside** the existing `neoc` runtime (Rust + mlua) at `../neoc/`, in a single Cargo workspace, with **hard crate boundaries** between compiler and runtime.

Non-goal: the runtime keeps its current behaviour. The compiler crates never call into the runtime crate; the runtime crate never calls into the compiler crates. They share nothing but the on-disk `.lua` artefact. The **only** place they meet is the top-level `neoc` binary, which wires both into one CLI as sibling subcommands.

---

## Source of truth

What we're porting (TS, ~11.6 kloc across `src/neoc/**`):

| Concern | TS file | Notes |
| --- | --- | --- |
| Tree-sitter grammar | `zed/tree-sitter-neoc/grammar.js` | Already Rust-consumable via `tree-sitter` crate. Reuse the C parser — do **not** rewrite the grammar. |
| Generated AST shapes | `src/neoc/ast/nodes.generated.ts` (+ `generate.ts`) | Regenerate as Rust enums/structs from `node-types.json`. |
| CST → AST adapter | `src/neoc/parser/adapter.ts` (361 loc) | Single biggest port. |
| Lowering passes | `src/neoc/parser/lower-{block,match,range,try}.ts` (~518 loc) | Pure tree rewrites. |
| Type inference | `src/neoc/types/{type,env,infer,walk}.ts` (~1.5 kloc) | Bidirectional, with `Result<T,E>` narrowing + exhaustiveness. |
| Lua codegen | `src/neoc/codegen/lua/index.ts` (415 loc) | Pure functions, string out. |
| Macro registry + builtins | `src/neoc/macros/*.ts` | Built-ins are static; user macros are TS callbacks today — see §5. |
| Formatter | `src/neoc/fmt.ts` | Small. |
| LSP server | `src/neoc/lsp.ts` (3.1 kloc) | Largest single file. Port last. |
| CLI + driver | `src/cli.ts`, `src/neoc/driver.ts`, `src/neoc/compiler.ts` | Thin. |

Reference runtime: `../neoc/` — Cargo project (`mlua` + Luau, tokio, hyper, sqlx). Owns `src/lua/{lib,std,vnd}/`.

---

## 1. Workspace layout

Single Cargo workspace at the repo root. Each concern is its own crate so the boundary is enforced by the compiler, not by convention.

```
neoc/                              ← becomes the workspace root after the merge
├── Cargo.toml                     ← [workspace] members = [...]
├── crates/
│   ├── neoc/                      ← the one and only binary; thin clap dispatcher
│   │   └── src/main.rs            ← bin `neoc` — `run`, `build`, `fmt`, `lsp`, `watch`, ...
│   │
│   ├── neoc-runtime/              ← was ../neoc (mlua, std, vnd, sandbox) — now a lib only
│   │   └── src/lib.rs             ← unchanged content: lua/, dto/; `main.rs` deleted
│   │
│   ├── neoc-grammar/              ← tree-sitter parser (C + Rust bindings)
│   │   ├── grammar.js             ← moved from zed/tree-sitter-neoc/
│   │   ├── src/parser.c           ← generated, committed
│   │   ├── src/node-types.json
│   │   ├── build.rs               ← cc::Build, compiles parser.c
│   │   └── src/lib.rs             ← pub fn language() -> tree_sitter::Language
│   │
│   ├── neoc-ast/                  ← typed AST + node-kind enums
│   │   └── src/lib.rs             ← hand-written core + generated/ (build.rs from node-types.json)
│   │
│   ├── neoc-parser/               ← CST → AST adapter + lowering passes
│   │   └── src/
│   │       ├── adapter.rs
│   │       ├── lower_block.rs
│   │       ├── lower_match.rs
│   │       ├── lower_range.rs
│   │       └── lower_try.rs
│   │
│   ├── neoc-types/                ← type system: type.rs, env.rs, infer.rs, walk.rs
│   │
│   ├── neoc-macros/               ← MacroRegistry + built-in derive/attr macros
│   │
│   ├── neoc-codegen-lua/          ← AST → Lua string
│   │
│   ├── neoc-compiler/             ← top-level orchestrator (was compiler.ts + driver.ts)
│   │   └── src/lib.rs             ← pub fn transpile(src: &str) -> Result<CompileOutput>
│   │
│   ├── neoc-fmt/                  ← formatter
│   │
│   └── neoc-lsp/                  ← LSP server (tower-lsp) as a lib; launched via `neoc lsp`
│
├── editors/                       ← was zed/ + intellij/ (unchanged)
├── examples/                      ← .neoc + emitted .lua fixtures
├── specs/                         ← language + ide specs (unchanged)
└── tests/                         ← end-to-end: compile .neoc, run with neoc-runtime
```

### Dependency graph (enforced by `Cargo.toml`)

```
neoc (bin) ──► neoc-runtime          (for `neoc run …`)
           └─► neoc-compiler ──► neoc-codegen-lua ──► neoc-ast
                     │           ▲                      ▲
                     │           └── neoc-macros ───────┘
                     └─► neoc-types  ──► neoc-ast
                     └─► neoc-parser ──► neoc-ast ──► neoc-grammar
           └─► neoc-lsp ──► neoc-compiler, neoc-types, neoc-parser, neoc-fmt
           └─► neoc-fmt ──► neoc-ast, neoc-parser

neoc-runtime  ──► (none of the compiler crates)
neoc-compiler ──► (does not depend on neoc-runtime, mlua, tokio, hyper)
```

The `neoc` binary crate is the **only** place runtime and compiler meet. Each side stays unaware of the other; the dispatcher just calls `neoc_runtime::run(...)` or `neoc_compiler::transpile(...)` based on argv. Both halves can compile, test, and release independently of each other inside the workspace.

### CLI surface

One binary, runtime and compiler as sibling subcommands:

```
neoc run <script.luau>           # runtime — execute a Luau script (today's `neoc <script>`)
neoc build [-s '**/*.neoc']      # compiler — .neoc → .lua
neoc watch [-s '**/*.neoc']      # compiler — build on change
neoc fmt <path>                  # compiler — format .neoc in place
neoc lsp                         # compiler — LSP over stdio
neoc check <path>                # compiler — parse + typecheck, no emit
```

The bare `neoc <script>` form (current runtime UX) is preserved by clap as a fallback that dispatches to `run` when the first arg is a path. README, specs, install scripts updated in the same PR that renames.

---

## 2. Tree-sitter strategy

Drop `web-tree-sitter` + wasm. Compile the C parser into `neoc-grammar` directly.

- Keep `grammar.js`, `node-types.json`, and the corpus tests; move them under `crates/neoc-grammar/`.
- `build.rs` calls `cc::Build::new().file("src/parser.c").compile("tree-sitter-neoc")`.
- The Zed extension still needs the WASM build — `setup-grammar.sh` regenerates both, no behaviour change for editors.
- AST node enums are generated from `node-types.json` by a `build.rs` in `neoc-ast`, mirroring `ast/generate.ts`.

---

## 3. Port order

Each step lands as one PR. Tests for the ported layer go in alongside it; the TS tests stay as the parity oracle until the LSP is cut over.

1. **Workspace skeleton.** Move `../neoc/` under `crates/neoc-runtime/`; add empty stub crates for every compiler crate; `cargo build` green.
2. **`neoc-grammar`.** Move `zed/tree-sitter-neoc/` into the crate; `cc` build; smoke test parses `examples/showcase.neoc`.
3. **`neoc-ast`.** Hand-write the core enums; generate node-kind structs from `node-types.json`; round-trip a parsed CST into the typed AST shape (no behaviour, just types).
4. **`neoc-parser`.** Port `adapter.ts` first, then each `lower-*.ts` in isolation. Each lowering has its own `#[cfg(test)]` module mirroring the TS test file.
5. **`neoc-codegen-lua`.** Port `codegen/lua/index.ts`. Diff every `examples/*.lua` byte-for-byte against the TS output as the acceptance test (commit a fixtures dir).
6. **`neoc-macros`.** Port the registry + built-ins. See §5 for the user-macro story.
7. **`neoc-types`.** Port `type.rs` → `env.rs` → `walk.rs` → `infer.rs`. Type inference is the trickiest port; keep the TS tests as the parity table.
8. **`neoc-compiler` + `neoc-fmt` + `neoc` bin (compiler subcommands).** Orchestrator, formatter, and wire `build` / `watch` / `fmt` / `check` into the dispatcher next to the already-shipping `run`.
9. **`neoc-lsp` + `neoc lsp` subcommand.** Port the LSP last on `tower-lsp`; expose it as `neoc lsp`. The 3.1 kloc TS LSP is mostly contributors over already-ported layers — should be mechanical once 1-8 land.
10. **Decommission TS.** Delete `src/`, `package.json`, `bun.lock`, `biome.json`, `tsconfig.json`. Update `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`. Editors keep working: grammar lives in `crates/neoc-grammar/`, LSP binary is `neocc lsp`.

Each step keeps the TS compiler runnable so `bun test` is the parity oracle. The TS source is only deleted in step 10.

---

## 4. Parity testing

Two layers run on every PR after step 5:

- **Golden Lua diffs.** Every `examples/*.neoc` is compiled by both `bun ../src/cli.ts build` and `cargo run -p neoc -- build`; the two `.lua` outputs must match byte-for-byte. Drives the codegen port.
- **Behavioural tests.** The emitted `.lua` runs through `neoc-runtime` (the binary from `crates/neoc-runtime/`) and asserts script output. Catches lowering bugs that golden diffs miss (e.g. evaluation order in `match`).

TS unit tests stay green until step 10. New Rust tests are added per-crate, not in a central tests/ dir.

---

## 5. Open question: user macros

Built-in macros (`#[derive(Clone)]` etc.) are pure data — port them straight.

**User-authored macros** are TS functions today, registered through `macros/api.ts`. In Rust the options are:

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Built-ins only.** Drop the user-macro extension point. | Simplest. Matches what every shipped example uses. | Breaks anyone (anyone?) authoring TS macros. |
| **B. Macros as `.lua` scripts** run by an embedded mlua instance inside the compiler. | Same VM the runtime already uses — no new surface area. Users write macros in the language they already know. | Compiler links mlua. Slow start. **Violates** the "compiler does not depend on runtime" rule unless we factor mlua out of `neoc-runtime` into a shared `neoc-mlua` crate — which we'd then own from both sides. |
| **C. Macros as WASM components.** | Clean isolation. | Brand-new toolchain for users. |

Recommendation: **A** for the v1 Rust port; revisit B once we know whether anyone depends on user macros. Decide before step 6 lands.

---

## 6. Crate-isolation rules (enforced)

- `neoc-runtime/Cargo.toml` lists none of the compiler crates as dependencies. CI greps for any such line and fails the build.
- Compiler crates (`neoc-ast`, `neoc-parser`, `neoc-types`, `neoc-macros`, `neoc-codegen-lua`, `neoc-compiler`, `neoc-fmt`, `neoc-lsp`) do not depend on `mlua`, `tokio`, or `hyper`. CI greps `cargo tree -p <crate>` output and fails if any of those appear.
- The `neoc` binary crate is the **only** crate allowed to list both `neoc-runtime` and `neoc-compiler` as dependencies. Both halves remain unaware of the other.
- No `pub use` re-exports across the runtime/compiler boundary — even types like `CompileOutput` stay on their own side.
- Shared types that genuinely need to cross (none expected today) get their own leaf crate, depended on by both — never one depending on the other.

---

## 7. What we are **not** doing

- Not rewriting the grammar. `grammar.js` is unchanged.
- Not changing the language semantics. Every spec under `specs/` stays valid.
- Not changing the emitted Lua. Step 5's byte-diff acceptance gate enforces this.
- Not merging the runtime and compiler into one **crate**. They share one binary (`neoc`) but stay isolated libraries — the binary is the only seam.
- Not porting the IntelliJ plugin (Kotlin, talks to the LSP over stdio — unaffected).
