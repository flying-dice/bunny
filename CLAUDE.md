# CLAUDE.md

Guidance for Claude (and any LLM agent) working in the **Bunny** repo.

> 🐰 Bunny — the Spring Framework for Bun. Fast as a rabbit, familiar as Spring.

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
> The reason your bean is not being injected is likely because you forgot to decorate the class with `@Injectable`, so the container has no provider registered for it.

**After:**
> The bean isn't injected because the class is missing `@Injectable` — the container has no provider for it. Add the decorator.

Same fix, half the words.

---

## Terse, Not Cryptic

Tight writing stays clear and grammatical. We're not dropping articles or mangling sentences — we're removing waste. The result should read like a sharp engineer who respects the reader's time, not like shorthand.

Some things stay exact and complete. **Never** abbreviate or stylize these:

| Thing | Rule |
| --- | --- |
| Code blocks | Real code, real syntax. |
| API names | Exact. `@Injectable` stays `@Injectable`. |
| Type signatures | Exact. Never trim a type. |
| Error / log messages | Quote verbatim. |
| Commands | Exact: `bunny nest`, `bunny hop`, `bunny burrow`. |
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
 * Registers a provider in the Bunny container.
 *
 * @param token - Injection token to bind.
 * @param provider - Class or factory that resolves the token.
 * @returns The container, for chaining.
 */
```

Prose around a code sample stays terse. The doc comment itself stays complete. Know the difference.

---

## Voice Stays Bunny

Terse, but the brand stays warm. Bunny is playful but professional. Keep:
- Friendly error messages. Help the user, don't scold.
- Rabbit/spring puns **only when they make something clearer or more memorable**. Puns for their own sake get cut.
- Easter eggs welcome — hidden in the CLI, docs, and source. Discoverable, never in the way.

Tagline stays clean: **"Spring into TypeScript."**

---

## Commits & PRs

Use [Conventional Commits](https://www.conventionalcommits.org). Terse, but spec-compliant.

Format: `type(scope): description`

```
fix(di): bean not injected when factory is async

Container now awaits the factory. Adds a test.

Closes #42.
```

- **Type** — one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scope** — optional, the affected area (e.g. `di`, `router`, `cli`, `core`).
- **Description** — imperative, lowercase, no trailing period.
- **Body** — optional, terse prose. Bullet what changed.
- **Footer** — `Closes #42`, `Refs #7`, etc.
- **Breaking changes** — append `!` after type/scope (`feat(di)!:`) **and** add a `BREAKING CHANGE:` footer with full, careful English so readers can't miss it.

```
feat(container)!: drop sync factory support

BREAKING CHANGE: Factories must now return a Promise. Wrap sync
factories in `Promise.resolve()` to migrate.
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
