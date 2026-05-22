# Controllers

A controller is a class tagged `@controller`. Its instance methods, tagged with an HTTP-verb JSDoc tag, become routes.

```ts
/** @controller */
export class UsersController {
  /** @get /users */
  list(_req: TypedRequest): JsonResponse<User[]> { ... }
}
```

No base path. The path on `@get` / `@post` / etc. is the full route. Bun's router resolves `:id` segments automatically.

## Verb tags

| Tag             | HTTP method     |
| --------------- | --------------- |
| `@get <path>`   | GET             |
| `@post <path>`  | POST            |
| `@put <path>`   | PUT             |
| `@delete <path>`| DELETE          |
| `@patch <path>` | PATCH           |
| `@options <path>` | OPTIONS       |
| `@head <path>`  | HEAD            |

One verb tag per method. The first one wins.

**Edge cases:**

- A method with no verb tag is ignored — it's not a route, just a method.
- Static methods are ignored even with a verb tag (Bunny only walks `getInstanceMethods()`).
- `@get` (or any verb) with no path falls back to `/`. Always state the path explicitly.

## Tags

`@tag NAME` adds an OpenAPI tag. Multiple allowed per method.

```ts
/**
 * @get /users
 * @tag users
 * @tag admin
 */
list(_req: TypedRequest): JsonResponse<User[]> { ... }
```

## The request

```ts
interface Input {
  params?: Record<string, string>;
  query?:  Record<string, unknown>;
  body?:   unknown;
}

interface TypedRequest<
  I extends Input = {},
  C extends string = "application/json",
> extends globalThis.Request {
  readonly params: I extends { params: infer P } ? P : {};
  readonly query:  I extends { query:  infer Q } ? Q : {};
  json(): Promise<I extends { body: infer B } ? B : unknown>;
}
```

`TypedRequest` extends the standard Fetch `Request` with typed `params`, `query`, and `json()`. The runtime value *is* a real `Request` — Bunny attaches `params` / `query` as own-properties before the handler runs. `C` declares the request body's media type (used by codegen for the OpenAPI `requestBody.content` key; not referenced at runtime).

```ts
// path params
get(req: TypedRequest<{ params: { id: string } }>) {
  req.params.id;          // string
}

// query
search(req: TypedRequest<{ query: { q: string; limit?: string } }>) {
  req.query.q;            // string
  req.query.limit;        // string | undefined
}

// body
create(req: TypedRequest<{ body: CreateUserDto }>) {
  const dto = await req.json();   // typed
}
```

Path-param type info on the `params` field tells Bunny to *describe* the parameter in the OpenAPI spec; the runtime value of every path segment is a `string`. Use a type alias with `@format uuid` if you need both documentation and runtime validation:

```ts
/** @format uuid */
export type Uuid = string;

get(req: TypedRequest<{ params: { id: Uuid } }>) { ... }
```

See [Validation](./validation.md#format-predicates) for how `@format` is checked.

### Request body media types

`TypedRequest` defaults to `application/json`. For other media types, use the aliases (or pass the type as a second generic):

| Alias                          | Content type                          | Read with              |
| ------------------------------ | ------------------------------------- | ---------------------- |
| `JsonRequest<I>` *(default)*   | `application/json`                    | `await req.json()`     |
| `XmlRequest<I>`                | `application/xml`                     | `await req.text()`     |
| `TextRequest<I>`               | `text/plain`                          | `await req.text()`     |
| `HtmlRequest<I>`               | `text/html`                           | `await req.text()`     |
| `FormRequest<I>`               | `application/x-www-form-urlencoded`   | `await req.formData()` |
| `MultipartRequest<I>`          | `multipart/form-data`                 | `await req.formData()` |

The alias name drives the OpenAPI `requestBody.content` key.

## The response

```ts
type TypedResponse<
  T = void,
  S extends number = 200,
  C extends string = "application/json",
> = globalThis.Response & {
  readonly __body?: T;
  readonly __status?: S;
  readonly __contentType?: C;
};
```

`TypedResponse` is a standard Fetch `Response` plus phantom `__body` / `__status` / `__contentType` brands. The codegen reads the brands to build the OpenAPI `responses` object; the runtime value is just a `Response`.

```ts
JsonResponse<User>                              // 200 application/json
JsonResponse<User, 201>                          // 201 application/json
TypedResponse<string, 204, "text/plain">         // 204 text/plain
```

### Response aliases

| Alias                              | Content type           |
| ---------------------------------- | ---------------------- |
| `JsonResponse<T, S?>` *(default)*  | `application/json`     |
| `TextResponse<S?>`                 | `text/plain`           |
| `HtmlResponse<S?>`                 | `text/html`            |
| `XmlResponse<T?, S?>`              | `application/xml`      |

### Multiple statuses

Union return types declare multiple responses:

```ts
get(req: TypedRequest<{ params: { id: string } }>):
  | JsonResponse<User>
  | JsonResponse<{ message: string }, 404> {
  const u = this.users.find(req.params.id);
  if (!u) return Response.json({ message: "not found" }, { status: 404 });
  return Response.json(u);
}
```

Same-status union members merge into one response with multiple `content` entries — useful for content negotiation:

```ts
list(): JsonResponse<User[]> | XmlResponse<User[]> {
  return Response.json([]);
}
```

```yaml
'200':
  content:
    application/json: { schema: { type: array, items: ... } }
    application/xml:  { schema: { type: array, items: ... } }
```

`Promise<TypedResponse<...>>` is unwrapped automatically.

## Free-form summary

JSDoc prose before the first JSDoc tag (any tag — `@get`, `@tag`, `@param`, …) becomes the operation's `summary` in OpenAPI:

```ts
/**
 * List every user.            ← becomes operation summary
 *
 * @get /users
 * @tag users
 */
list(_req: TypedRequest): JsonResponse<User[]> { ... }
```

## operationId

The method name becomes the OpenAPI `operationId`. Bunny enforces uniqueness across all controllers — duplicate method names error at generation time and list every collision so you can rename.

## What it looks like generated

The handler emitted into `routes.ts` is plain TypeScript wrapping your method:

```ts
"/users/:id": {
  GET: (req: BunRequest) =>
    safeInvoke(async () => {
      const r = req as any;
      r.query = Object.fromEntries(new URL(req.url).searchParams);
      await applyValidation(r, { params: validate_get_params });
      return await _usersController.get(r as ...);
    }),
}
```

`safeInvoke` and `applyValidation` come from `@flying-dice/bunny` (see [Validation](./validation.md#error-contract) for the resulting 400 / 500 contract). `_usersController` is the singleton wired by [Dependency injection](./dependency-injection.md).

## Mixing in hand-written routes

`Bun.serve({ routes })` accepts an object. Spread Bunny's handlers with your own:

```ts
import handlers from "./generated/routes.ts";

Bun.serve({
  port: 3000,
  routes: {
    ...handlers,
    "/health": () => new Response("ok"),
    "/openapi.json": () => new Response(Bun.file("./generated/openapi.json")),
  },
});
```
