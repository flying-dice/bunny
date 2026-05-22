# Bunny

Bunny generates a Bun HTTP app and an OpenAPI 3.1 spec from JSDoc-tagged TypeScript classes. It reads your source with [ts-morph](https://ts-morph.com) at codegen time and writes plain TypeScript: an `app.ts` for dependency wiring, a `routes.ts` for handlers, and an `openapi.json` for the spec. The generated files are intended to be committed and read.

## Install

```bash
bun add @flying-dice/bunny
```

Or run one-shot without installing: `bunx @flying-dice/bunny --help`.

## Minimal example

```ts
// src/users.controller.ts
import type { JsonResponse, TypedRequest } from "@flying-dice/bunny";

/** @controller */
export class UsersController {
  /** @inject users */
  constructor(private users: UsersService) {}

  /**
   * Fetch a single user.
   * @get /users/:id
   * @tag users
   */
  getUser(
    req: TypedRequest<{ params: { id: string } }>
  ): JsonResponse<User> | JsonResponse<{ message: string }, 404> {
    const u = this.users.find(req.params.id);
    if (!u) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(u);
  }
}
```

```bash
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated
```

```ts
// src/server.ts
import routes from "./generated/routes.ts";
Bun.serve({ port: 3000, routes });
```

See [Getting started](./docs/getting-started.md) for the full walkthrough.

## Documentation

| Topic                                                     | Type        | Covers                                                                       |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| [Getting started](./docs/getting-started.md)              | Tutorial    | Install → first controller → generate → serve.                               |
| [Controllers](./docs/controllers.md)                      | Reference   | `@controller`, verb tags, `TypedRequest` / `TypedResponse`, request and response aliases. |
| [Dependency injection](./docs/dependency-injection.md)    | Reference   | `@provides`, `@inject`, profiles, interface-typed dependencies, the repository pattern. |
| [Validation](./docs/validation.md)                        | Reference   | Property vocabulary, `@format`, error contract.                              |
| [OpenAPI](./docs/openapi.md)                              | Reference   | Spec emission, type-alias hoisting, content types, response unions.          |
| [CLI](./docs/cli.md)                                      | Reference   | Flags, targets, `.bunnyrc`.                                                  |
| [Programmatic API](./docs/programmatic-api.md)            | Reference   | `generate`, `generateBun`, `runCli`.                                         |
| [How it works](./docs/how-it-works.md)                    | Explanation | The discovery → resolution → emission pipeline.                              |

## Examples

Three runnable examples under [`examples/`](./examples), each with its own README:

| Example                            | Demonstrates                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| [`examples/api`](./examples/api/)  | Layered JSON API, repository pattern, in-memory ↔ SQLite swap via `@profile`.        |
| [`examples/csr`](./examples/csr/)  | React frontend + Bunny JSON backend served by one `Bun.serve`.                       |
| [`examples/ssr`](./examples/ssr/)  | Server-rendered React from a controller method via `renderToReadableStream`.         |

Each has a `bun run example:<name>` script that regenerates the artifacts and an `:serve` script that runs the server.

## Status

Early. The shape is stable enough to use. Issues and PRs welcome.

## License

MIT.
