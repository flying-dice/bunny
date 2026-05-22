# How it works

Bunny is a codegen pipeline. No runtime reflection, no metadata, no decorators. Every binding visible in the output is a direct consequence of something in your source.

```
                  ┌──────────────────────────┐
   source.ts ───▶ │  ts-morph Project        │ ──▶  controllers, services
                  └──────────────────────────┘
                                │
                                ▼
                  ┌──────────────────────────┐
                  │  Discovery               │      @controller, @get/@post/...
                  │  (JSDoc walk)            │      @provides, @profile, @inject
                  └──────────────────────────┘
                                │
                                ▼
                  ┌──────────────────────────┐
                  │  Resolution              │      Resolve @provides tokens to
                  │  (symbol identity)       │      declaration symbols. Match
                  │                          │      @inject params to @provides
                  │                          │      candidates, filtered by
                  │                          │      active profile.
                  └──────────────────────────┘
                                │
                ┌───────────────┴────────────────┐
                ▼                                ▼
        ┌───────────────┐               ┌────────────────┐
        │ OpenAPI       │               │ Bun codegen    │
        │ generator     │               │                │
        │               │               │   app.ts       │
        │   openapi     │               │   routes.ts    │
        │   .json/yaml  │               │                │
        └───────────────┘               └────────────────┘
```

## Why codegen, not runtime DI?

The obvious alternative is what NestJS does: emit decorator metadata at TypeScript compile time, read it at boot, build a container at runtime. That model needs `reflect-metadata`, the `experimentalDecorators` compiler flag, and a runtime introspection layer for every binding.

Bunny does the same work at *codegen time* and writes the result to disk. The trade is one build step in exchange for:

- **Auditable output.** Every binding is visible in `app.ts`. No "what does the container actually do?" — the answer is the file.
- **No decorator stage.** No `reflect-metadata`, no `experimentalDecorators`, no emit-decorator-metadata. Bunny's input is plain TS with JSDoc.
- **One source of truth.** The same ts-morph walk drives the OpenAPI spec, the validators, and the wiring. They can't drift, because they all come from the same read.
- **Tree-shakeable output.** `routes.ts` is plain TypeScript; bundlers see exactly what's used.

The cost: a regeneration step when JSDoc changes. In practice that's a `bun --watch` away.

## 1. Load the project

ts-morph loads every file matched by `--source`, plus their transitive dependencies (so pointing at controllers is enough — Bunny follows imports to find the services they refer to). Either a real `tsconfig.json` is honoured or ts-morph runs standalone with permissive defaults.

ts-morph wraps the TypeScript compiler API with a navigable, mutable AST — cheaper than rolling our own visitor against `typescript` directly, and it gives us full type-checker access for resolving `implements` clauses and `@inject` parameter types to their declaration symbols.

## 2. Discover

Walk every `ClassDeclaration` in the project:

- **Has `@controller`** → it's a controller. Walk its instance methods, find the one with an HTTP-verb JSDoc tag, record `(httpMethod, path, methodName, tags, MethodDeclaration)`. Walk its constructor JSDoc for `@inject` directives. Each `@inject paramName` records the matching parameter's name, its TypeScript type's *resolved symbol identity*, and its textual name (for messages).
- **Has any `@provides Token`** → it's a service. For each token, resolve `Token` against the class's `implements` / `extends` / self relationships. The match yields a *resolved symbol identity* — the declaration ts-morph points at. Record `{ name, key }` for each. Read `@profile <name>` if present.
- **Neither** → ignored.

Operation IDs (method names) are checked for uniqueness across all controllers; collisions error here.

## 3. Resolve

For each service / controller, resolve every `@inject`:

1. Filter services by active profile: keep services with no `@profile` and services whose `@profile` matches.
2. For the inject's resolved symbol key, find every service whose `provides` list contains it.
3. After filtering: 1 candidate → wire it; 0 → error; 2+ → error and demand `@profile` disambiguation.

Resolution is by **symbol identity** — the declaration ts-morph resolves to. Two `Repo` interfaces in different files don't share a key; they don't collide.

Once every inject has a concrete service, the graph is topologically sorted. Cycles error here.

## 4. Emit OpenAPI

For each route, build an `OperationObject`:

- `parameters` from `TypedRequest<{ params, query }>`.
- `requestBody` from `body`, under the alias's content type (`JsonRequest` → `application/json`, `XmlRequest` → `application/xml`, etc.).
- `responses` from the return type — walk `TypedResponse<T, S, C>` brands, union members produce one response per status. Same-status members merge content types.

Walk every type reference and *hoist* named types (`type` / `interface` / `class`) into `components/schemas`. Multi-level alias chains hoist each level separately. Generic instantiations and library types are inlined.

Walk every property's JSDoc for the [property vocabulary](./validation.md#property-vocabulary) (`@minLength`, `@format`, `@pattern`, …). These land as OpenAPI keywords on the schema.

## 5. Emit Bun

Two files in lockstep:

### `app.ts` — DI wiring

```ts
import { ProductsController } from "./controllers/ProductsController.ts";
import { InMemoryProductRepository } from "./repositories/InMemoryProductRepository.ts";
import { IdService } from "./services/IdService.ts";
import { ProductService } from "./services/ProductService.ts";

// ---- Service instances ----
export const _idService = new IdService();
export const _inMemoryProductRepository = new InMemoryProductRepository();
export const _productService = new ProductService(_inMemoryProductRepository, _idService);

// ---- Controller instances ----
export const _productsController = new ProductsController(_productService);
```

Every instance is `export const _<camelCaseName>`. The leading `_` keeps it from colliding with framework-conventional locals (Bun's `req`, etc.). Singletons — instantiated once at module load.

### `routes.ts` — handlers + validators

A path-keyed `handlers` object plus one `assertX` function per named component and one `validate_<method>_<kind>` function per route input. Each handler is wrapped by `safeInvoke`, which calls `applyValidation` before the controller method, maps `RequestValidationError` → 400, and maps any other throw → 500.

```ts
export const handlers = {
  "/products/:id": {
    GET: (req) =>
      safeInvoke(async () => {
        // attach typed query, validate, invoke
      }),
  },
  ...
};
export default handlers;
```

Validators are plain template-literal TypeScript — no Ajv, no Zod, no codegen DSL. See [Validation](./validation.md) for the property vocabulary and the 400 / 500 contract. The full shape of a generated route is in [Controllers — What it looks like generated](./controllers.md#what-it-looks-like-generated).

## Static guarantees

Several things hold *because* the pipeline is static:

- **Every wire is in `app.ts`.** No runtime container, no late resolution. Open `app.ts` and the entire dependency graph is visible.
- **The spec mirrors the code.** Both come from the same ts-morph walk. Drift is impossible by construction.
- **No `reflect-metadata`.** Bunny doesn't need it; the types are read at codegen time, not runtime.
- **Generated code reads.** `routes.ts` and `app.ts` are not bundles. They're TypeScript a careful human could have written. Audit them, commit them, ship them.

## Where things live in the source

The framework itself is small. Key files:

| File                              | Role                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| `src/internal/discover.ts`        | JSDoc walk: controllers, services, `@inject`, `@provides`.          |
| `src/internal/wiring.ts`          | Inject resolution + topo sort + `app.ts` emission.                  |
| `src/internal/asserter.ts`        | Type walk → `assertX` validator emission.                           |
| `src/internal/jsdoc-constraints.ts` | Property JSDoc → constraint table (`@minLength`, `@format`, …).   |
| `src/internal/hoist.ts`           | "Is this type hoistable?" → `components/schemas`.                   |
| `src/internal/route-types.ts`     | `TypedRequest<…>` generic extraction → `params` / `query` / `body`. |
| `src/internal/path.ts`            | `:id` ↔ `{id}` and friends.                                         |
| `src/internal/emit.ts`            | Small emission helpers (relative imports, identifier casing).       |
| `src/generator.ts`                | OpenAPI 3.1 document assembly.                                      |
| `src/bun.ts`                      | Two-file Bun.serve module emission.                                 |
| `src/cli.ts`                      | Args + rc + glue.                                                   |
| `src/runtime.ts`                  | `safeInvoke`, `applyValidation`, `FORMATS`.                         |
| `src/http.ts`                     | `TypedRequest` / `TypedResponse` + aliases.                         |

If you're contributing, those are the files to know. Each is short (≤ 400 LOC) and does one thing.

## Next

Now that you have the model:

- Write a controller — [Controllers](./controllers.md).
- Wire services — [Dependency injection](./dependency-injection.md).
- Make the spec accurate — [OpenAPI](./openapi.md) and [Validation](./validation.md).
- Drive it from a build script — [Programmatic API](./programmatic-api.md).
- Run it from CI — [CLI](./cli.md).
