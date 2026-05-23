# neoc — brand

## What it is

A Rust-flavoured Lua dialect. `.neoc` source compiles to `.lua` that runs on stock Lua 5.4 or any embedded runtime that hosts Lua — including [neoc](https://github.com/flying-dice/neoc), the Rust + mlua runtime the language was designed for.

## What it sounds like

Short, sharp, lowercase: **neoc**. One syllable. Rhymes with "geek." The compiler artefact is **neoc-compiler**; the language is **neoc**; the file extension is **`.neoc`**; the CLI binary is `neoc`.

## What it adds to Lua

- `struct` — named record types with branded runtime identity and validated `.new` factories.
- `impl` — methods attached to a struct's table.
- `trait` + `impl Trait for X` — required methods + default-bodied inheritance.
- `match` — value-yielding pattern matching that lowers to a Lua IIFE.
- `#[macro]` attributes — compile-time codegen for derives, field constraints, and (eventually) function attributes.
- `Result<T, E>`, `Ok(v)`, `Err(e)` — auto-injected prelude for explicit error handling.

## Voice

Direct. No filler. No marketing.

| Do | Don't |
| --- | --- |
| Say what neoc does. | Sell why neoc is great. |
| Use Lua terms when they apply (`table`, `metatable`, `require`). | Carry over Bun / Node / TypeScript metaphors. |
| Keep code samples runnable. | Sprinkle pseudo-code that won't compile. |
| Match the [house style](CLAUDE.md). | Hedge or apologise. |

## What it isn't

- A TypeScript dialect. (It used to be. It isn't any more.)
- A Lua superset. The grammar covers a deliberate declaration surface and stops there.
- A framework, runtime, or service container. The output is plain Lua.
