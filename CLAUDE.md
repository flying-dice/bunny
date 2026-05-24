# CLAUDE.md

Guidance for Claude (and any LLM agent) working in the **neoc-compiler** repo.

> neoc-compiler — a Rust-flavoured source language for scripting runtimes. Lua 5.4 is the first target (`.neoc` → `.lua`); the codegen layer is decoupled from the language surface so other targets can plug in. The compiler ships as `@flying-dice/neoc-compiler`; the language is `neoc`; the CLI is `neoc`; the matching Lua runtime is the separate `neoc` project (Rust + mlua).

---

## House Style: Terse

Write tight. Cut every word that doesn't carry meaning.

This repo favors short, direct prose. Most explanatory writing — docs, comments, commits, PR bodies, chat — should be stripped of filler, hedging, and ceremony. Keep the substance, drop the padding.

**Cut these:**
- Pleasantries — "Sure, I'd be happy to help" → just answer
- Hedging — "it might be worth considering" → say it plainly
- Filler — "the reason this happens is because" → "because"
- Throat-clearing — get to the point in the first sentence

**Before:**
> The reason `Foo.new(data)` isn't being generated is likely because the struct doesn't have a `#[derive(...)]` attribute, a trait impl, or any field constraints, so the emitter doesn't synthesise a factory for it.

**After:**
> `Foo.new` isn't generated because the struct has nothing to validate — no derives, no traits, no field constraints. Add `#[derive(Clone)]` or write an explicit `impl Foo`.

Same fix, half the words.

---

## Terse, Not Cryptic

Tight writing stays clear and grammatical. We're not dropping articles or mangling sentences — we're removing waste. The result should read like a sharp engineer who respects the reader's time, not like shorthand.

Some things stay exact and complete. **Never** abbreviate or stylize these:

| Thing | Rule |
| --- | --- |
| Code blocks | Real code, real syntax. |
| API names | Exact. `#[derive(Clone)]` stays `#[derive(Clone)]`. |
| Type signatures | Exact. Never trim a type. |
| Error / log messages | Quote verbatim. |
| Commands | Exact: `neoc build`, `neoc compile`, `neoc lsp`. |
| File paths, env vars | Exact. |
| `tsdoc` doc comments | Full, normal English — see below. |
| Legal, LICENSE, security notes | Complete and careful. |

Rule of thumb: **trim filler, never trim fact.**

---

## Docs Enforcement

Two doc layers, different rules.

**1. Prose docs** (guides, README body, tutorials, blog) → terse.
- Short sentences. Lead with the point.
- One idea per line where it helps.
- No ceremony, no hedging.

**2. API reference** (`tsdoc` comments on public types/functions) → full, normal English.
- These get parsed by `tsdoc` and rendered for users and tooling. They must be clear, complete, and grammatical.
- Clipped phrasing in a `@param` is bad DX. Write proper sentences.

```ts
/**
 * Registers a macro with the registry.
 *
 * @param macro - The macro to register. The kind determines which slot
 *   (field-constraint / derive / function-attr) it lands in.
 */
```

Prose around a code sample stays terse. The doc comment itself stays complete. Know the difference.

---

## Voice

Direct. No marketing language. Friendly error messages that help the user, never scold. No rabbit / spring / Bun / Easter motifs — that brand belonged to an earlier life of the project when it targeted TypeScript on Bun. neoc-compiler now targets scripting runtimes (Lua first); the voice is plain.

---

## Commits & PRs

Use [Conventional Commits](https://www.conventionalcommits.org). Terse, but spec-compliant.

Format: `type(scope): description`

```
fix(codegen): trait defaults emit a clean Lua function signature

Previously inlined the trait's TS-style signature verbatim, producing
invalid Lua. Now goes through the same paramName extractor inherent
impl methods use.

Closes #42.
```

- **Type** — one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scope** — optional, the affected area (e.g. `parser`, `emitter`, `cli`, `lsp`, `macros`).
- **Description** — imperative, lowercase, no trailing period.
- **Body** — optional, terse prose. Bullet what changed.
- **Footer** — `Closes #42`, `Refs #7`, etc.
- **Breaking changes** — append `!` after type/scope (`feat(macros)!:`) **and** add a `BREAKING CHANGE:` footer with full, careful English so readers can't miss it.

```
feat(macros)!: function-attr macros emit __<kind>_<fn> descriptors

BREAKING CHANGE: Macros that previously emitted route handlers as the
function replacement must now use ctx.appendModule to register a
descriptor. The assembler harvests it across files at build time.
```

PR titles follow the same format — the squash-merge commit inherits them, so they feed the changelog.

---

## Quick Card

| Trim (terse prose) | Keep exact / full |
| --- | --- |
| Guide prose | Code blocks |
| README body | API names + types |
| Tutorials | `tsdoc` doc comments |
| Commit/PR body | Error strings |
| Inline chat | Commands, paths, env |
| Casual comments | Legal / security / migration |

---

*Few words. Full meaning.*
