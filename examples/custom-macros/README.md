# Custom macros example

Two user-authored macros, loaded via `--macro`.

| Macro | Kind | What it does |
| --- | --- | --- |
| `#[derive(JsonString)]` | derive | Emits `Foo.toJsonString(self)` — a manual JSON encoder for the struct's fields. |
| `#[email]` | field-constraint | Validates a string field looks like an email address inside `.new`. |

## Build it

From this directory:

```
bun ../../src/cli.ts build -s 'app.neoc' --macro ./macros.ts
```

Writes `app.lua` next to `app.neoc`. The `.lua` is committed alongside the source so the example doubles as a regression artefact.

## What `app.neoc` looks like

```neoc
#[derive(JsonString)]
struct User {
  #[minLength(1)]
  name: string,
  #[email]
  email: string,
  active: boolean,
}
```

## What the macros emit

`#[derive(JsonString)]` synthesises `User.toJsonString(self)` with an inline `encode` helper that handles strings (with quote / backslash escaping), numbers, booleans, and `nil`:

```lua
function User.toJsonString(self)
  local function encode(v) … end
  return table.concat({
    '{',
    '"name":' .. encode(self.name),
    ',"email":' .. encode(self.email),
    ',"active":' .. encode(self.active),
    '}',
  })
end
```

`#[email]` weaves a guard into `User.new`:

```lua
if type(data.email) ~= "string" or not string.match(data.email, "^[%w._%%+-]+@[%w.-]+%.[%a]+$") then
  error("User.email: expected a valid email address")
end
```

Run it:

```
User.new({ name = "Alice", email = "alice@example.com", active = true }):toJsonString()
-- => {"name":"Alice","email":"alice@example.com","active":true}
```

## Authoring your own

A macro module is a TypeScript file whose default export is an array of `Macro` values:

```ts
import type { DeriveMacro, FieldConstraintMacro, Macro } from "@flying-dice/neoc-compiler/macro";

const MY_DERIVE: DeriveMacro = {
  kind: "derive",
  name: "Greet",
  emit(_ctx, { struct }) {
    return `function ${struct.name}.greet(self) return "hi, " .. self.name end`;
  },
};

export default [MY_DERIVE] satisfies Macro[];
```

Three macro kinds are available:

- **`derive`** — runs on `#[derive(Name)]`. Returns one full Lua function definition; the emitter attaches it after the struct's auto-generated methods.
- **`field-constraint`** — runs on `#[name(args…)]` attached to a struct field. Returns an array of guard statements that get woven into `.new` in source order.
- **`function-attr`** — runs on `#[name]` attached to a function. Replaces the function body or appends module-level state via `ctx.appendModule` / `ctx.appendToRecord`.

The full contract lives in `src/neoc/macros/api.ts`. Built-in macros in `src/neoc/macros/builtins.ts` are the reference implementation.

Load any number of modules by repeating `--macro`:

```
neoc build -s '**/*.neoc' --macro ./macros/json.ts --macro ./macros/auth.ts
```
