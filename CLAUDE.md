# CLAUDE.md

Guidance for Claude (and any LLM agent) working in the **Neoc** repo.

> 🐰 Neoc — a Rust-flavoured TypeScript dialect for Bun. `.neoc` → plain `.ts`.

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

## Voice Stays Neoc

Terse, but the brand stays warm. Neoc is playful but professional. Keep:
- Friendly error messages. Help the user, don't scold.
- Rabbit/spring puns **only when they make something clearer or more memorable**. Puns for their own sake get cut.
- Easter eggs welcome — hidden in the CLI, docs, and source. Discoverable, never in the way.

Tagline stays clean: **"Spring into TypeScript."**

---

## Commits & PRs

Use [Conventional Commits](https://www.conventionalcommits.org). Terse, but spec-compliant.

Format: `type(scope): description`

```
fix(sql): mutations with RETURNING dispatch through .get instead of .run

Otherwise UPDATE ... RETURNING silently dropped the returned row.
Adds a test against bun:sqlite.

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

🐰 *Few words. Full meaning. Hop in.*
