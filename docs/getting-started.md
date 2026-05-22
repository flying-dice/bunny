# Getting started

Install, write a controller, generate, serve. Five minutes.

## Install

```bash
bun add @flying-dice/bunny
```

Bunny is a peer of TypeScript ≥ 5. Bun ≥ 1.3 recommended (Bun's `routes` API is required for the generated `routes.ts`).

## 1. Write a service

Tag the class `@provides <SelfName>`. Bunny instantiates it once at module load.

```ts
// src/users.service.ts
import type { User } from "./user.ts";

const DB: User[] = [
  { id: "1", name: "Ada", email: "ada@example.com" },
  { id: "2", name: "Grace", email: "grace@example.com" },
];

/** @provides UsersService */
export class UsersService {
  list(): User[] {
    return DB;
  }
  find(id: string): User | undefined {
    return DB.find((u) => u.id === id);
  }
}
```

## 2. Write a controller

Tag the class `@controller`. Each method that should be a route gets an HTTP-verb tag (`@get`, `@post`, …) with the full path. `@inject` on the constructor's JSDoc pulls in services.

```ts
// src/users.controller.ts
import type { JsonResponse, TypedRequest } from "@flying-dice/bunny";
import type { User } from "./user.ts";
import type { UsersService } from "./users.service.ts";

/** @controller */
export class UsersController {
  /** @inject users */
  constructor(private users: UsersService) {}

  /**
   * List every user.
   * @get /users
   * @tag users
   */
  list(_req: TypedRequest): JsonResponse<User[]> {
    return Response.json(this.users.list());
  }

  /**
   * Fetch one.
   * @get /users/:id
   * @tag users
   */
  get(
    req: TypedRequest<{ params: { id: string } }>
  ): JsonResponse<User> | JsonResponse<{ message: string }, 404> {
    const u = this.users.find(req.params.id);
    if (!u) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(u);
  }
}
```

## 3. Generate

```bash
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated
```

This writes:

```
src/generated/
├── openapi.json   # OpenAPI 3.1 spec
├── app.ts         # DI wiring (singletons, exported by name)
└── routes.ts      # spreadable Bun.serve `routes` + per-route validators
```

Inspect `app.ts` — every wire is visible:

```ts
// src/generated/app.ts (excerpt)
export const _usersService = new UsersService();
export const _usersController = new UsersController(_usersService);
```

## 4. Serve

```ts
// src/server.ts
import routes from "./generated/routes.ts";

Bun.serve({ port: 3000, routes });
```

```bash
bun src/server.ts
curl :3000/users
```

## 5. Iterate

Run the generator on every change (or wire it into a watch script):

```bash
bun --watch run src/server.ts                     # serve with hot reload
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated  # regenerate after editing JSDoc
```

The generated files are committed code in every project I've seen — version them, review them.

## Next steps

- More verbs, path params, query, body — see [Controllers](./controllers.md).
- Swap implementations between environments — see [Dependency injection](./dependency-injection.md).
- Add `@minLength`, `@format email`, etc. to your entities — see [Validation](./validation.md).
- All CLI flags + `.bunnyrc` — see [CLI](./cli.md).
