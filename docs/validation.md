# Validation

JSDoc tags on properties (and on type aliases) become both OpenAPI keywords and runtime checks. Bunny emits plain TypeScript validator functions — no Ajv, no Zod, no template engine, no runtime metadata.

```ts
export interface CreateUserDto {
  /** @minLength 1 @maxLength 100 */
  name: string;
  /** @format email */
  email: string;
  /** @minimum 0 @maximum 150 */
  age?: number;
}
```

That's enough. Bunny derives a `validate_createUser_body` function and applies it before your handler runs.

## Property vocabulary

| JSDoc tag             | Applies to | OpenAPI keyword                 | Checked at runtime? |
| --------------------- | ---------- | ------------------------------- | ------------------- |
| `@format NAME`        | string     | `format`                        | ✓ (built-in + extensible) |
| `@minLength N`        | string     | `minLength`                     | ✓                   |
| `@maxLength N`        | string     | `maxLength`                     | ✓                   |
| `@pattern REGEX`      | string     | `pattern`                       | ✓                   |
| `@minimum N`          | number     | `minimum`                       | ✓                   |
| `@maximum N`          | number     | `maximum`                       | ✓                   |
| `@exclusiveMinimum N` | number     | `exclusiveMinimum`              | ✓                   |
| `@exclusiveMaximum N` | number     | `exclusiveMaximum`              | ✓                   |
| `@multipleOf N`       | number     | `multipleOf`                    | ✓                   |
| `@minItems N`         | array      | `minItems`                      | ✓                   |
| `@maxItems N`         | array      | `maxItems`                      | ✓                   |
| `@uniqueItems`        | array      | `uniqueItems: true`             | ✓ (use `@uniqueItems false` to opt out) |
| `@minProperties N`    | object     | `minProperties`                 | spec only           |
| `@maxProperties N`    | object     | `maxProperties`                 | spec only           |
| `@default JSON`       | any        | `default`                       | spec only           |
| `@example JSON`       | any        | `example`                       | spec only           |
| `@deprecated`         | any        | `deprecated: true`              | spec only           |
| `@title TEXT`         | any        | `title`                         | spec only           |
| `@description TEXT`   | any        | `description`                   | spec only           |

Free-form JSDoc prose before the first JSDoc tag becomes `description` automatically — no explicit `@description` needed.

**Notes:**

- `@default` / `@example` parse their argument as JSON; on parse failure the raw string is kept.
- `@pattern` is emitted verbatim; it's anchored only if you anchor it, and no regex flags are supported. Escape forward slashes inside the pattern.
- Conflicting constraints (`@minimum 10 @maximum 5`) compile fine and produce an always-failing field at runtime. Bunny doesn't warn.

## Type aliases carry constraints

JSDoc on a `type` alias propagates into every property that uses it. Lifts the constraint into one place:

```ts
/** @format email */
export type Email = string;

/** @format uuid */
export type Uuid = string;

export interface User {
  id: Uuid;        // ← format uuid
  email: Email;    // ← format email
  name: string;
}
```

The OpenAPI generator hoists each alias into `components/schemas/{Email,Uuid}` and the validators emit `assertEmail` / `assertUuid` helpers. See [OpenAPI](./openapi.md#type-alias-hoisting) for the details.

**Precedence.** Property-level JSDoc overrides constraints inherited from the alias. Both still appear in the spec (as sibling keywords beside `$ref`) per OpenAPI 3.1 semantics.

## `@format` predicates

Built-in formats:

| Name        | Pattern (informal)                                                                  |
| ----------- | ----------------------------------------------------------------------------------- |
| `uuid`      | 8-4-4-4-12 hex                                                                      |
| `email`     | `local@host.tld` (RFC-lite)                                                         |
| `date-time` | ISO 8601 datetime                                                                   |
| `date`      | `YYYY-MM-DD`                                                                        |
| `time`      | `HH:MM[:SS[.ffff]][Z|±HH:MM]`                                                       |
| `duration`  | ISO 8601 duration (`P3Y6M4DT12H30M5S`)                                              |
| `uri`       | absolute URI                                                                        |
| `url`       | alias for `uri`                                                                     |
| `ipv4`      | dotted-quad                                                                         |
| `ipv6`      | colon-hex                                                                           |
| `hostname`  | RFC 1123                                                                            |
| `byte`      | Base64                                                                              |

### Adding your own

`FORMATS` is a plain object of `(s: string) => boolean` predicates. Extend it before booting the server (or in your app's bootstrap module):

```ts
import { FORMATS } from "@flying-dice/bunny";

FORMATS.slug = (s) => /^[a-z0-9-]+$/.test(s);
FORMATS.iban = (s) => isValidIban(s);
```

Then `@format slug` is checked at request time and emitted as `format: slug` in the spec.

## Where validation runs

For every route, Bunny emits up to three validators: `params`, `query`, `body`. They run inside the wrapper before the controller method is invoked:

```ts
// from generated routes.ts
"/users/:id": {
  GET: (req: BunRequest) =>
    safeInvoke(async () => {
      const r = req as any;
      r.query = Object.fromEntries(new URL(req.url).searchParams);
      await applyValidation(r, {
        params: validate_getUser_params,
        // query/body if declared
      });
      return await _usersController.getUser(r as ...);
    }),
}
```

Validation runs on the parsed body (`await req.json()`). The original request stream is replaced with the parsed object so your handler doesn't have to read it again.

## Error contract

Validation failures produce a 400; handler exceptions produce a 500. The bodies are stable JSON.

```ts
// 400 — request failed validation
{
  error: "BadRequest",
  source: "request",
  location: "params" | "query" | "body",
  path: string,     // JSON-pointer-ish (".email", ".tags[2]"); "" if the body itself is malformed
  reason: string,   // e.g. "expected length >= 1", "expected format uuid", "invalid JSON"
}

// 500 — handler threw (or rejected)
{
  error: "InternalServerError",
  source: "response",
  reason: string,   // err.message
  name: string,     // err.name (e.g. "TypeError")
}
```

Special case: a body whose declared content type is `application/json` but whose payload doesn't parse → 400 with `path: ""` and `reason: "invalid JSON"`.

Example bad request:

```bash
curl -s -X POST :3000/users -H 'content-type: application/json' \
  -d '{"name":"","email":"nope"}' | jq
```

```json
{
  "error": "BadRequest",
  "source": "request",
  "location": "body",
  "path": ".name",
  "reason": "expected length >= 1"
}
```

## Turning validation off

`--no-validate` (or `validate: false` in `.bunnyrc`) skips validator emission. `safeInvoke` still wraps every handler so handler throws still surface as 500s — only the request-shape checks are dropped.

Useful for hot paths where you want to lean on a faster check (e.g., a typed gateway in front of the server). The OpenAPI spec stays accurate regardless.

## What it looks like generated

For an interface like:

```ts
export interface User {
  /** @format uuid */
  id: string;
  /** @minLength 1 @maxLength 100 */
  name: string;
}
```

Bunny emits something like:

```ts
function assertUser(v: unknown, path: string): void {
  if (typeof v !== "object" || v === null) throw new AssertionError(path, "expected object");
  const o = v as Record<string, unknown>;

  if (typeof o.id !== "string") throw new AssertionError(`${path}.id`, "expected string");
  if (!FORMATS.uuid(o.id)) throw new AssertionError(`${path}.id`, "expected format uuid");

  if (typeof o.name !== "string") throw new AssertionError(`${path}.name`, "expected string");
  if (o.name.length < 1) throw new AssertionError(`${path}.name`, "expected length >= 1");
  if (o.name.length > 100) throw new AssertionError(`${path}.name`, "expected length <= 100");
}
```

Readable, hand-written-looking, dependency-free. Read the generated `routes.ts` once — you'll know exactly what's checked.
