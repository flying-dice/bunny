# API example

A pure JSON API generated from Bunny `@controller`s and `@provides` classes. Run it, hit the endpoints with curl, then open `openapi.json` to see the spec Bunny emitted from the same source.

## Run

```bash
bun run example:api          # regenerate app.ts, routes.ts, openapi.json (default profile)
bun run example:api:prod     # same, but with --profile production
bun run example:api:serve    # bun examples/api/server.ts
```

Visit:

| Endpoint            | Verb     | What it does                                                 |
| ------------------- | -------- | ------------------------------------------------------------ |
| `/`                 | GET      | Plain-text route index (hand-written in `server.ts`).        |
| `/openapi.json`     | GET      | Static OpenAPI spec (hand-written in `server.ts`).           |
| `/users`            | GET POST | List / create users.                                         |
| `/users/:id`        | GET DEL  | Fetch / delete a single user.                                |
| `/users/xml`        | POST     | XML body demo — content type comes from `XmlRequest<…>`.     |
| `/products`         | GET POST | List / create products.                                      |
| `/products/:id`     | GET      | Fetch one.                                                   |
| `/health`           | GET      | Plain-text health check (returns `text/plain`).              |

```bash
curl -s :3000/users | jq
curl -s -X POST :3000/users -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com"}'

# Validation fires before the controller runs:
curl -s -X POST :3000/users -H 'content-type: application/json' \
  -d '{"name":"","email":"nope"}' | jq
# → { "error":"BadRequest","source":"request","location":"body","path":".name","reason":"expected length >= 1" }
```

## What it shows

- **Layered project layout**: `controllers/`, `services/`, `repositories/`, `entities/`, `dtos/`, `types/`. One class per file, PascalCase filename matches the name. Bunny doesn't care about the structure — every file in the glob is scanned.
- **Constructor DI**: `UsersController` and `ProductsController` each declare `@inject <paramName>` directives on their constructor JSDoc. The codegen emits positional `new UsersController(_usersService)` calls in `app.ts`.
- **Repository pattern + polymorphic DI**: `repositories/ProductRepository.ts` is an *interface*. Two classes declare `@provides ProductRepository` — `InMemoryProductRepository` (`@profile default`) and `SqliteProductRepository` (`@profile production`, backed by `bun:sqlite`). `ProductService.constructor(repo: ProductRepository)` consumes the interface; Bunny picks the impl whose `@profile` matches the active profile. `bun run example:api` wires the in-memory one; `bun run example:api:prod` wires the SQLite one. The controller never knows which is running.
- **Service composition**: `ProductService` injects both the repository (resolved by `@provides`) and `IdService` (resolved directly). Topo-sorted in `app.ts`.
- **Validation from types alone**: every `@minLength`, `@minimum`, `@format`, etc. on a property becomes both an OpenAPI keyword and a runtime check in `routes.ts`. No schema library.
- **Type-alias hoisting**: `Email` and `Uuid` (in `types/`) carry `@format` JSDoc that Bunny lifts into `components/schemas/{Email,Uuid}`. Properties that use them become `$ref`s.
- **Mixed routes**: `server.ts` spreads the Bunny-generated handlers with hand-written ones (`/`, `/openapi.json`) in a single `Bun.serve` call.

## Layout

```
api/
├── controllers/
│   ├── UsersController.ts
│   └── ProductsController.ts
├── services/
│   ├── UsersService.ts
│   ├── ProductService.ts          (depends on the ProductRepository interface)
│   └── IdService.ts
├── repositories/
│   ├── ProductRepository.ts       (interface — the storage contract)
│   ├── InMemoryProductRepository.ts   (@provides + @profile default)
│   └── SqliteProductRepository.ts     (@provides + @profile production — bun:sqlite)
├── entities/
│   ├── User.ts
│   └── Product.ts
├── dtos/
│   ├── CreateUserDto.ts
│   └── CreateProductDto.ts
├── types/
│   ├── Email.ts          (`@format email`)
│   ├── Uuid.ts           (`@format uuid`)
│   └── ProductId.ts
├── app.ts                (generated — DI wiring, exported singletons)
├── routes.ts             (generated — validators + handlers object)
├── openapi.json          (generated)
└── server.ts             (hand-written — Bun.serve, spreads `routes`)
```
