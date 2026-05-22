# OpenAPI

Bunny generates an OpenAPI 3.1 document — JSON or YAML — from your controllers. The same source drives the spec *and* the runtime validators, so they can't drift.

```bash
bunx @flying-dice/bunny openapi -s 'src/**/*.ts' -o src/generated
# → src/generated/openapi.json

bunx @flying-dice/bunny openapi -s 'src/**/*.ts' -o src/generated --format yaml
# → src/generated/openapi.yaml
```

The OpenAPI document is one of the two artifacts Bunny emits. The other is the runtime wiring — see [Controllers](./controllers.md) and [Dependency injection](./dependency-injection.md) for that side.

## What gets emitted

For each `@controller` × verb-tagged method:

- **Path item**: the `@get`/`@post`/etc. path, with `:id` and `{id}` both translated to `{id}` (OpenAPI form).
- **Operation**:
  - `operationId` = method name. Bunny enforces uniqueness across the project.
  - `summary` = JSDoc prose before the first `@tag`.
  - `tags` = every `@tag NAME` on the method.
  - `parameters` = each property of `TypedRequest<{ params, query }>`.
  - `requestBody` = the `body` property's type, under the alias's content type.
  - `responses` = one entry per declared status, derived from the return-type union.

## Path parameters

Every `:id`-style segment in a route path becomes a path parameter. If the method's `TypedRequest<{ params: { id: Uuid } }>` types it, the schema follows that type — otherwise it's a plain `string`.

```ts
/** @get /users/:id */
get(req: TypedRequest<{ params: { id: Uuid } }>) { ... }
```

```yaml
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema: { $ref: '#/components/schemas/Uuid' }
```

## Query parameters

Each property of `query` becomes a query parameter. Optional TS properties (`q?: string`) become `required: false`.

```ts
/** @get /search */
search(req: TypedRequest<{ query: { q: string; limit?: string } }>) { ... }
```

```yaml
parameters:
  - name: q     ; in: query ; required: true  ; schema: { type: string }
  - name: limit ; in: query ; required: false ; schema: { type: string }
```

## Request body

The `body` property's type becomes `requestBody.content[<mediaType>].schema`. The media type comes from the request alias used:

| Request alias                   | Media type                          |
| ------------------------------- | ----------------------------------- |
| `TypedRequest<I>` *(default)*   | `application/json`                  |
| `JsonRequest<I>`                | `application/json`                  |
| `XmlRequest<I>`                 | `application/xml`                   |
| `TextRequest<I>`                | `text/plain`                        |
| `HtmlRequest<I>`                | `text/html`                         |
| `FormRequest<I>`                | `application/x-www-form-urlencoded` |
| `MultipartRequest<I>`           | `multipart/form-data`               |

Override explicitly:

```ts
create(req: TypedRequest<{ body: User }, "application/xml">) { ... }
```

## Responses

`TypedResponse<T, S?, C?>` brands the response with body, status, content-type. The generator reads all three. Response aliases lock in their content type by name:

| Response alias                  | Default status | Media type                                       |
| ------------------------------- | -------------- | ------------------------------------------------ |
| `TypedResponse<T, S?, C?>`      | 200            | from `C` (defaults to `application/json`)        |
| `JsonResponse<T, S?>`           | 200            | `application/json`                               |
| `XmlResponse<T?, S?>`           | 200            | `application/xml`                                |
| `TextResponse<S?>`              | 200            | `text/plain`                                     |
| `HtmlResponse<S?>`              | 200            | `text/html`                                      |

Each emitted status gets a default `description` from its IANA reason phrase (`200 → OK`, `201 → Created`, `204 → No Content`, `400 → Bad Request`, `404 → Not Found`, `500 → Internal Server Error`, …). To override, post-process the generated `openapi.json`, or merge fields under `base.paths` via the [Programmatic API](./programmatic-api.md).

```ts
get(req: TypedRequest<{ params: { id: string } }>):
  | JsonResponse<User>
  | JsonResponse<{ message: string }, 404> { ... }
```

```yaml
responses:
  '200':
    description: OK
    content:
      application/json: { schema: { $ref: '#/components/schemas/User' } }
  '404':
    description: Not Found
    content:
      application/json:
        schema:
          type: object
          properties: { message: { type: string } }
          required: [message]
```

Same-status union members merge into one response with multiple `content` entries — for content negotiation:

```ts
list(): JsonResponse<User[]> | XmlResponse<User[]> {
  return Response.json([]);
}
```

```yaml
'200':
  description: OK
  content:
    application/json: { schema: { type: array, items: ... } }
    application/xml:  { schema: { type: array, items: ... } }
```

`Promise<TypedResponse<...>>` unwraps automatically. Plain `Response` (no brand) becomes `200` with no content.

## Type-alias hoisting

Every user-defined `type` / `interface` / `class` referenced by name becomes a `components/schemas` entry — including primitive aliases. References use `$ref`.

```ts
/** @format email */
export type Email = string;

export interface User {
  email: Email;
  name: string;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      format: email
    User:
      type: object
      properties:
        email: { $ref: '#/components/schemas/Email' }
        name:  { type: string }
      required: [email, name]
```

Multi-level alias chains keep their structure — each level is its own component.

**Not hoisted:**
- Generic instantiations (`Partial<User>`, `Box<T>`) — no useful canonical name.
- Library types (`Response`, `Date`, `URL`, …) — anything from `lib/` or `node_modules/`.

Those get inlined like anonymous shapes.

Property-level JSDoc on a `$ref` is preserved as sibling keywords (OpenAPI 3.1 permits this):

```ts
interface Order {
  /** @description billing contact override */
  email: Email;
}
```

```yaml
Order:
  properties:
    email:
      $ref: '#/components/schemas/Email'
      description: billing contact override
```

## Customising the document envelope

Pass a `base` object to override `info`, `servers`, etc. From the CLI, set it in `.bunnyrc`:

```json
{
  "sourceFiles": "src/**/*.ts",
  "outDir": "src/generated",
  "base": {
    "info": { "title": "Users API", "version": "1.2.0" },
    "servers": [{ "url": "https://api.example.com" }]
  }
}
```

Or programmatically — see [Programmatic API](./programmatic-api.md).

## Spec-only vs runtime keywords

Some property JSDoc tags affect the spec but not runtime validation (and vice versa for a few). See the [Validation reference](./validation.md#property-vocabulary) for which is which.

## Serving the spec

The generated `openapi.json` is a static file. Serve it however you like — `Bun.file` is the simplest:

```ts
import handlers from "./generated/routes.ts";

Bun.serve({
  port: 3000,
  routes: {
    ...handlers,
    "/openapi.json": () => new Response(Bun.file("./generated/openapi.json")),
  },
});
```

Point any OpenAPI viewer (Swagger UI, Redoc, Scalar) at `/openapi.json` and you're done.
