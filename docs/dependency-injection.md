# Dependency injection

Bunny's DI is one tag (`@provides`) plus one directive (`@inject`). No decorators, no runtime reflection. The container is the generated `app.ts`.

## The model

- A class enters the graph by carrying at least one `@provides <Token>` tag. The token names what the class fulfils.
- A class consumes dependencies with `@inject <paramName>` on its constructor JSDoc — one per constructor parameter. The parameter's TypeScript type names the dependency.
- At generation time, Bunny matches every `@inject` to a `@provides` by **symbol identity** (the resolved declaration), filtered by the active [profile](#profiles).

```ts
/** @provides UsersService */
export class UsersService { ... }

/** @controller */
export class UsersController {
  /** @inject users */
  constructor(private users: UsersService) {}
}
```

The class is its own token here (`@provides UsersService` on `class UsersService`). That's the common case.

## Self-token vs interface-token

You can `@provides` your class's own name (self-token) or any interface / class the class `implements` / `extends`:

```ts
/** @provides Repo */                            // interface-token
export class InMemoryRepo implements Repo { ... }

/** @provides IdService */                       // self-token
export class IdService { ... }
```

**Rule.** The token must resolve to a type the class actually has a relationship with — either it `implements` the type, it `extends` the type, or the token is the class's own name. Bunny verifies this at generation time. Lie about it and you get:

```
bunny: Liar: @provides Repo — class does not implement, extend, or equal "Repo".
  Add `implements Repo` (or rename the @provides token to match the class itself).
```

**Multiple tokens.** A class may carry multiple `@provides` tags — each registers it under a separate token, useful when one impl satisfies several interfaces:

```ts
/**
 * @provides ReadOnlyRepo
 * @provides Repo
 */
export class InMemoryRepo implements Repo, ReadOnlyRepo { ... }
```

**Generic type parameters are ignored.** `@inject foo` against a parameter typed `Repo<Product>` resolves to `Repo`'s declaration — Bunny doesn't distinguish per-type-argument. If you need different impls per entity, write separate interfaces (`ProductRepo`, `UserRepo`) rather than generic parameters.

## How resolution works

For every `@inject paramName`:

1. Take the parameter's TypeScript type. Resolve it to a declaration symbol (interface, class, type alias).
2. Find every service whose `@provides` list contains that symbol.
3. Filter by active [profile](#profiles).
4. After filtering:
   - **1 candidate** → wire it.
   - **0** → error: `no active service @provides <Token> under profile "<X>"`.
   - **2+** → error: `multiple services @provides <Token> under profile "<X>"; give each a distinct @profile`.

Matching is by **symbol identity**, not string. Two `Repo` interfaces in different files (e.g. `auth/Repo.ts` and `billing/Repo.ts`) don't collide — each consumer resolves to its own file's `Repo`.

## Multiple injects

One `@inject <param>` per constructor parameter, in any order. Every parameter must be injected (no partial wiring).

```ts
/** @provides ProductService */
export class ProductService {
  /**
   * @inject repo
   * @inject ids
   */
  constructor(
    private repo: ProductRepository,
    private ids: IdService
  ) {}
}
```

Generated:

```ts
export const _idService = new IdService();
export const _inMemoryProductRepository = new InMemoryProductRepository();
export const _productService = new ProductService(_inMemoryProductRepository, _idService);
```

Dependencies are topologically ordered. Cycles error at generation time.

## The repository pattern

A repository interface separates business logic from storage. The service depends on the *interface*; concrete implementations register against it.

```ts
// repositories/ProductRepository.ts — the contract
export interface ProductRepository {
  list(): Product[];
  find(id: string): Product | undefined;
  add(p: Product): void;
}

// repositories/InMemoryProductRepository.ts — the impl
/**
 * @provides ProductRepository
 * @profile default
 */
export class InMemoryProductRepository implements ProductRepository { ... }

// services/ProductService.ts — the consumer
/** @provides ProductService */
export class ProductService {
  /** @inject repo */
  constructor(private repo: ProductRepository) {}
}
```

`ProductService` never names a concrete. Bunny picks the impl at generation time based on the active profile.

## Profiles

`@profile <name>` restricts a service to a named profile. Services with no `@profile` tag match every profile.

```ts
/** @provides ProductRepository @profile default */
export class InMemoryProductRepository implements ProductRepository { ... }

/** @provides ProductRepository @profile production */
export class SqliteProductRepository implements ProductRepository { ... }
```

Select a profile with `--profile`:

```bash
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated                         # default profile
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated --profile production    # picks Sqlite
```

The flag (or `profile` in `.bunnyrc`) defaults to `"default"`. Each environment is a separate generator run into a separate output directory; production builds import the production `app.ts`, test builds the test one.

### Resolution rule (with profiles)

When the active profile is `"X"`:

- A service with `@profile X` is active.
- A service with no `@profile` tag is active.
- A service with `@profile Y` (Y ≠ X) is excluded — not imported into `app.ts`, not considered as a candidate.

Two impls of the same interface under the same profile is still an error. Either give them distinct profiles, or restrict one to a non-current profile.

**One `@profile` per service.** Multiple `@profile` tags on the same class error at generation time. Register the same impl under multiple profiles by writing thin subclasses (or duplicating the file), one per profile.

## Testing services

Two options:

**A. Hand-wire the unit under test.** The interface gives you a seam:

```ts
import { ProductService } from "../services/ProductService";
import { InMemoryProductRepository } from "../repositories/InMemoryProductRepository";

test("ProductService.list returns repo contents", () => {
  const svc = new ProductService(new InMemoryProductRepository(), new IdService());
  svc.create({ name: "x", priceCents: 100, stock: 1 });
  expect(svc.list()).toHaveLength(1);
});
```

**B. Generate a test build.** Tag a fake impl with `@profile test`, then:

```bash
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated.test --profile test
```

Your test setup imports `from "src/generated.test/routes.ts"` and boots `Bun.serve` against it.

Use (A) for unit tests, (B) for integration tests that hit the whole app over HTTP.

## Common errors

| Error                                                                          | What happened                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `@provides X — class does not implement, extend, or equal "X"`                 | Token isn't a relationship the class has. Add `implements X` or fix the tag. |
| `no active service @provides <Token> under profile "<X>"`                      | Nothing matches. Forgot a `@provides`, or impl is restricted to another profile. |
| `multiple services @provides <Token> under profile "<X>"`                      | Two candidates collide. Give one a distinct `@profile`.            |
| `@inject parameter must have a named type annotation`                          | The constructor parameter's type isn't a class/interface reference. |
| `@inject <name> doesn't match any constructor parameter (have: …)`             | The `@inject` directive names a parameter that doesn't exist. Typo.  |
| `@inject on a constructor needs a parameter name (e.g. \`@inject users\`)`     | Bare `@inject` with no parameter name. Name the parameter.           |
| `constructor parameter "x" is not annotated with @inject; every parameter must be @inject'd or none at all` | Partial wiring. Add the missing `@inject x`. |
| `multiple @profile tags found — a service may declare at most one profile`     | Two or more `@profile` tags on one class. Pick one.                 |
| `@inject dependency cycle: A → B → A`                                          | Break the cycle, or invert one dependency.                          |
