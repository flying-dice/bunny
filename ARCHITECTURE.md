# Architecture

How `neoc-compiler` is structured, what each file owns, and the patterns every contributor (human or agent) follows.

## Pipeline

```
.neoc source
   │
   ▼  tree-sitter parse  (zed/tree-sitter-neoc/grammar.js)
CST (tree-sitter tree)
   │
   ▼  walk + adapt  (src/neoc/parser/adapter.ts)
Typed AST  (src/neoc/ast/index.ts, nodes.generated.ts)
   │
   ▼  match lowering  (src/neoc/parser/lower-match.ts)
Typed AST with body text rewritten for Lua
   │
   ▼  emit + macros  (src/neoc/codegen/lua/index.ts, src/neoc/macros/*)
Lua 5.4 source string
```

Every transformation is **single-purpose** and **read-only relative to its predecessor**. The parser never produces Lua; the codegen never re-parses; macros never mutate the AST.

## File ownership

Each feature has a primary home. Agents adding a feature touch the home file plus exactly one test file. Cross-cutting changes warrant a separate commit.

| Concern | Home file |
| --- | --- |
| Grammar productions | `zed/tree-sitter-neoc/grammar.js` |
| Generated parser bindings | `zed/tree-sitter-neoc/src/parser.c` (DO NOT edit by hand — regenerate via `setup-grammar.sh`) |
| Highlight queries | `zed/tree-sitter-neoc/queries/highlights.scm` + `zed/languages/neoc/highlights.scm` (mirror) |
| Typed AST shapes | `src/neoc/ast/index.ts` (hand-edited) and `nodes.generated.ts` (regenerated from `node-types.json`) |
| Tree → AST walking | `src/neoc/parser/adapter.ts` |
| match expression lowering | `src/neoc/parser/lower-match.ts` |
| Lua codegen | `src/neoc/codegen/lua/index.ts` |
| Built-in macros | `src/neoc/macros/builtins.ts` |
| Macro contract types | `src/neoc/macros/api.ts`, `registry.ts` |
| LSP server | `src/neoc/lsp.ts` |
| CLI entry | `src/cli.ts`, `src/neoc/driver.ts`, `src/neoc/compiler.ts` |
| Zed extension config | `zed/extension.toml`, `zed/languages/neoc/config.toml` |
| Zed extension Rust | `zed/src/lib.rs` |
| IntelliJ plugin | `intellij/src/main/kotlin/com/flyingdice/neoc/*.kt` |

## Conventions

### Naming

- `emit<Construct>(…)` — produces Lua source from an AST node. Pure function.
- `lower<Form>(…)` — rewrites one construct in terms of another (e.g. `lowerMatch` → IIFE).
- `render<Thing>(…)` — produces a single Lua snippet for a sub-piece (e.g. `renderMethod`).
- `parse<Construct>` — only inside `adapter.ts`, never elsewhere.

### Tests

Every feature lives next to a test file: `src/neoc/<feature>.test.ts`. The test:
- Calls `transpile(source)`.
- Asserts on the `lua` output string with `toContain` for the snippet shape.
- For grammar-level features, also asserts AST structure where it matters.

Run with `bun test`.

### Specs

Every feature has two spec files:
- `specs/<feature>.md` — language semantics, BDD-style **Given / When / Then**.
- `specs/ide-<feature>.md` — editor surface (highlighting / completion / hover / parse / transpile / run).

Both follow the format already established by `specs/struct.md` and `specs/ide-struct.md`.

### Grammar work

1. Edit `zed/tree-sitter-neoc/grammar.js`.
2. From inside `zed/tree-sitter-neoc/`:
   - `tree-sitter generate` regenerates `src/parser.c`, `src/grammar.json`, `src/node-types.json`.
   - `tree-sitter build --wasm` regenerates `tree-sitter-neoc.wasm` (consumed by the LSP via `web-tree-sitter`).
   - `tree-sitter test` runs the corpus under `test/corpus/`.
3. If the AST gains a new node kind, regenerate `src/neoc/ast/nodes.generated.ts` via the `ast/generate.ts` script.
4. Update `adapter.ts` to walk the new nodes.
5. Update `lower-match.ts` and/or `codegen/lua/index.ts` to emit them.

### Tree-sitter patterns we follow

- **`field('name', …)`** for every child the AST cares about. The walker reads fields by name; positional access is brittle.
- **`prec.left` / `prec.right`** for operator precedence. Avoid implicit `prec(N, …)` unless you can articulate the conflict it resolves.
- **`repeat1` vs `repeat`** — never use `repeat` on a rule that can match empty.
- **`token.immediate`** for adjacent-no-whitespace lexer rules (e.g. `#[` opener).
- **Corpus tests** for every new production. One pass-case, one fail-case, in `test/corpus/<topic>.txt`.

### Codegen patterns

- **Pure-function emitters.** `emit<Construct>(node) → string`. No I/O, no mutation of inputs.
- **`stripBraces` + `indent`** helpers wrap every body render. Don't roll your own.
- **`luaModuleString`** for any Lua string literal you embed in output.
- **`translateOpaque`** is the only place that mutates pass-through opaque text. New cross-syntax translations (e.g. `import` → `require`) go there.
- **State flips through the `state` parameter** (`usesResult`). Don't add module-level singletons.

### LSP patterns

- **Completion contributors** are pure functions: `(doc, pos, workspace) → CompletionItem[]`. Sort priority via `sortText` (`0_*` for high-priority, default for everything else).
- **Hover contributors** return `{ contents, range }` or null. Never throw.
- **Workspace symbol index** lives in `harvestSymbols`. Each declaration kind (struct / trait / function / impl) gets one entry plus per-method or per-field detail.

## Parallel-work guidelines (for agents)

1. **One feature per agent.** Don't bundle "ranges + pattern guards" into one task.
2. **Touch only files in your feature's ownership.** If you need to change `codegen/lua/index.ts` AND `grammar.js` AND `adapter.ts`, you're the only agent allowed to touch those for the duration of your task.
3. **Add tests in your own `<feature>.test.ts`.** Don't extend `lua.test.ts` (that file holds shared smoke tests, not feature-specific ones).
4. **Run `bun test && bun run typecheck` before reporting done.**
5. **Run `bun run example` and inspect `examples/showcase.lua`** if your feature should appear in the showcase.
6. **Write `specs/<feature>.md` + `specs/ide-<feature>.md`** following the existing format.
7. **Single commit per feature.** Convetional Commits format. PR body lists what was added, what changed, and one concrete example.
8. **Don't touch BRAND.md, CLAUDE.md, README.md** unless your feature changes the user-facing CLI or syntax — those files are the project's identity and need editorial review.

## Pre-flight checklist (for every PR)

- [ ] `bun test` green.
- [ ] `bun run typecheck` clean.
- [ ] `bun run example` writes a fresh `examples/showcase.lua` without errors.
- [ ] `luau examples/showcase.lua` runs without errors (when a smoke driver exists).
- [ ] New `specs/<feature>.md` + `specs/ide-<feature>.md` follow the existing format.
- [ ] Single commit per feature, Conventional Commits format.
