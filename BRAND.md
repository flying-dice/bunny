<div align="center">

# 🐰 Bunny

### A Rust-flavoured TypeScript dialect for Bun

*Fast as a rabbit. Familiar as TypeScript.*

</div>

---

## What is Bunny?

Bunny is a TypeScript dialect (`.tsb`) and small compiler for the [Bun](https://bun.sh) runtime. It adds `struct`, `impl`, `match`, and `#[macro]` attributes on top of TypeScript and transpiles to plain `.ts` — the runtime carries zero dependency on bunny.

The macro system turns idiomatic Rust patterns (derives, From/Into, attribute-driven codegen) into typed TypeScript. Project-level assemblers harvest macro descriptors across files to emit a route table, a typed fetch client, a CLI dispatcher, a typed event bus, and an OpenAPI 3.1 spec.

If you've ever wished Rust's struct/impl/derive ergonomics existed in TypeScript without giving up the runtime, that's Bunny.

---

## Brand Pillars

Three ideas hold the whole brand together. Everything — naming, docs, CLI output, visuals — should ladder back to at least one of them.

### 🥕 Fast
Bunny rides on Bun, one of the fastest JavaScript runtimes available. Rabbits are quick. The framework should *feel* quick — fast cold starts, fast hot reload, fast DX. Speed isn't a feature we mention; it's the baseline expectation.

### 🌱 Spring
"Spring" works on two levels: the season of new growth, and the spring in a rabbit's hop. Bunny is a fresh take on TypeScript — Rust-flavoured ergonomics, no runtime container, code that runs as plain TS. The brand carries the seasonal energy without owing anything to any particular framework.

### 🥚 Easter Eggs
Bunny has personality. The name itself is the first easter egg: *Bun → Bunny*, and bunnies bring Easter, and Easter is Spring. We lean into that loop everywhere — hidden surprises in the CLI, playful (never cringe) docs, friendly error messages. A framework people enjoy talking about.

---

## The Name

> **Bun → Bunny.** Same root, more whimsy.

The name does a remarkable amount of work:

- **Sounds like Bun** — instantly signals the runtime it's built on.
- **Bunnies are fast** — reinforces the speed identity.
- **Bunny → Easter → Spring** — connects to the season and the hop.
- **Easter eggs** — the whole "hidden surprises" brand voice falls out of the name for free.
- **Memorable & friendly** — easy to say, spell, and build a mascot around.

---

## Voice & Tone

Bunny is **playful but professional**. We're a serious framework that doesn't take *itself* too seriously.

| Do | Don't |
|----|-------|
| Warm, friendly, a little witty | Sarcastic or smug |
| Confident about performance | Boastful or hype-y |
| Plain language, good defaults | Jargon walls |
| Friendly error messages that help | Cold stack-trace dumps |
| Occasional rabbit/spring puns | Pun overload in every sentence |

**Rule of thumb:** if a pun makes the docs *clearer or more memorable*, keep it. If it's just there to be cute, cut it.

---

## Tagline Options

Primary candidates — pick one for the hero, keep a couple as rotating subheads:

- **"Spring into TypeScript."**
- **"Rust ergonomics, TypeScript at runtime."**
- **"Hop in."** *(short form / button copy)*

---

## Visual Identity

### Logo
A minimal, modern rabbit silhouette. The signature move: work a **spring coil** into the rabbit's form — an ear that curls into a coil, or a coiled tail — tying "rabbit" and "Spring" into a single mark. 🐰🌀

### Color Palette
An Easter-adjacent palette kept tasteful and modern — fresh, not garish.

| Role | Color | Hex | Notes |
|------|-------|-----|-------|
| Primary | Spring Green | `#4CAF6D` | Growth, freshness, "go" |
| Secondary | Warm Yellow | `#F5C451` | Easter warmth, energy |
| Accent | Soft Coral | `#F58E8E` | Friendly highlights |
| Ink | Charcoal | `#2A2D34` | Body text, logo on light |
| Paper | Off-white | `#FBFAF7` | Backgrounds |

### Typography
- **Display/Headings:** a friendly geometric sans with personality.
- **Body:** a clean, highly legible sans.
- **Code:** a crisp monospace — code samples are everywhere, so legibility wins.

---

## CLI & Command Vocabulary

Today's commands (see `bunny --help` for the full surface):

| Command | Action |
|---------|--------|
| `bunny build` | Compile every matching `.tsb` to sibling `.ts`. |
| `bunny compile` | Transpile a single `.tsb` file. |
| `bunny routes` | Emit a `Bun.serve` route table. |
| `bunny client` | Emit a typed fetch client. |
| `bunny cli` | Emit a CLI dispatcher from `#[command]`. |
| `bunny events` | Emit a typed event bus. |
| `bunny openapi` | Emit the OpenAPI 3.1 spec. |
| `bunny lsp` | Stdio language server (Zed/VS Code extensions). |

Future verbs (`nest`, `burrow`, `hop`) remain in the rabbit/spring vocabulary for scaffolding work yet to land.

> CLI output carries subtle seasonal touches and the occasional easter egg — discoverable, never in the way.

---

## Cultural Hooks

Recurring traditions that make the project fun to follow:

- **🐣 Easter releases** — major versions land around Easter when the calendar allows.
- **First Egg** — the `v1.0` codename.
- **Egg Hunt** — what we call changelog entries / release notes.
- **Hidden eggs** — small surprises tucked into the CLI, docs, and source for people who go looking.

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| **Name** | Bunny |
| **Descriptor** | A Rust-flavoured TypeScript dialect for Bun |
| **Runtime** | Bun |
| **Source** | `.tsb` (a TypeScript superset with `struct` / `impl` / `match` / `#[macro]`) |
| **Output** | Plain `.ts` — zero runtime dependency on bunny |
| **Pillars** | Fast · Spring · Easter Eggs |
| **Primary tagline** | Spring into TypeScript. |
| **Mascot** | A rabbit with a spring coil 🐰🌀 |

---

<div align="center">

*Bunny — hop in.* 🐰

</div>
