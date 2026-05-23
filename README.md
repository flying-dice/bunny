# Bunny

> 🐰 A Rust-flavoured TypeScript dialect for Bun. `.tsb` files transpile to plain `.ts` — runtime has zero dependency on `@flying-dice/bunny`.

Bunny adds **`struct`**, **`impl`**, **`match`**, and **`#[macro]` attributes** to TypeScript. The compiler transpiles `.tsb` → `.ts`, and each compiled file exports per-file consts (`routes`, `openapi`, `client`, `commands`, `listeners`) built from the macros in that file. You wire the app yourself by importing and spreading those consts in your `server.ts` / `cli.ts` — no project-wide assemblers, no generated wiring files, no runtime container.

You write `.tsb`; bunny writes `.ts`. After codegen, your app has no runtime dependency on this package.

## Install

```bash
bun add -d @flying-dice/bunny
```

Requires Bun ≥ 1.3 and TypeScript ≥ 5.

## Hello, tsb

`controllers/Products.tsb`:

```tsb
#[derive(Clone, Equals, ToJson)]
struct Product {
  #[format("uuid")]
  id: string,
  #[minLength(1), maxLength(200)]
  name: string,
  #[minimum(0)]
  priceCents: number,
}

#[get("/products/:id")]
export function getProduct(id: string): Product {
  return Product.new({ id, name: "Widget", priceCents: 250 });
}

#[post("/products")]
export function createProduct(body: Product): Product {
  return Product.new(body);
}
```

Compile it:

```bash
bunny build -s '**/*.tsb'
```

`controllers/Products.ts` is plain TypeScript: a `type Product`, a `const Product` with `new` / `clone` / `equals` / `toJson` methods, the two route functions, and three per-file consts:

- `export const routes` — `{ "/products/:id": { GET: (req) => … }, "/products": { POST: async (req) => … } }`
- `export const openapi` — the OpenAPI fragment for those paths
- `export const client` — typed fetch wrappers: `getProduct(id) → Promise<Product>` etc.

Then in `server.ts` (you write this once):

```ts
import {
  openapi as productsSpec,
  routes as productsRoutes,
} from "./controllers/Products.ts";

Bun.serve({
  port: 3000,
  routes: { ...productsRoutes },
});

await Bun.write(
  "openapi.json",
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Products API", version: "0.1.0" },
    paths: { ...productsSpec },
  }, null, 2),
);
```

For more controllers, add more imports + more `...spreads`. No assembler step, no hidden generated files — the app's surface is whatever you spread.

## Commands

```
bunny build    -s <glob>... [-w]      Compile every matching .tsb to sibling .ts.
bunny compile  <file.tsb> [-o out.ts] Transpile one file.
bunny lsp                             Stdio language server (used by editors).
```

`--source` / `-s` is repeatable; `--macro` loads user-authored macro modules; `--watch` re-runs `build` on change.

## Language features

### `struct` and `impl`

`struct` declares a data shape; `impl` declares its methods and factory. Each struct emits both a `type` alias *and* a `const` carrying its `new(data)` factory and any derived methods.

```tsb
struct Money {
  amount: number,
  currency: string,
}

impl Money {
  new(data: Money): Money { return data; }
  add(self: Money, other: Money): Money {
    if (self.currency !== other.currency) throw new Error("currency mismatch");
    return { amount: self.amount + other.amount, currency: self.currency };
  }
}
```

Methods take `self` as their first parameter (no `this`). Call them via the const: `Money.add(a, b)`.

If you write a `struct` with no `impl`, bunny synthesises a minimal one whenever the struct has derives, trait impls, or field constraints, so `Foo.new(data)` always exists.

### Field constraints

Validation guards inject into the synthesised or explicit `new(data)`. They throw on the first failing field.

```tsb
struct Email {
  #[format("email")]
  value: string,
}

struct User {
  #[deep]
  email: Email,
  #[minLength(1), maxLength(120)]
  name: string,
}
```

| Attribute | Applies to | Generated check |
| --- | --- | --- |
| `#[minLength(n)]` | string | `value.length >= n` |
| `#[maxLength(n)]` | string | `value.length <= n` |
| `#[pattern("re")]` | string | `/re/.test(value)` |
| `#[format("uuid"\|"email"\|"date-time"\|"date"\|"time"\|"ipv4")]` | string | Inline regex |
| `#[minimum(n)]` / `#[maximum(n)]` | number | `value >= n` / `value <= n` |
| `#[deep]` | struct field whose type is another struct | Chain through `Type.new(data.field)` |

Same-module struct fields chain automatically (no `#[deep]` needed). Cross-module struct fields opt in with `#[deep]` *and* must be imported as a value (not `import type`).

### Derives

`#[derive(Trait)]` on a struct appends methods to its impl.

| Derive | Generated method(s) |
| --- | --- |
| `Clone` | `clone(self): Self` |
| `Equals` | `equals(a, b): boolean` |
| `ToJson` | `toJson(self): string` and `fromJson(s: string): Self` (validates via `new`) |
| `Display` | `toString(self): string` |
| `Default` | `default(): Self` using zero-values or `#[default(...)]` per field |
| `Hash` | `hash(self): string` (stable FNV-1a over the JSON form) |
| `Event` | side-effect only: emits an `__event_<Name>` descriptor the events assembler harvests |

### `match`

Pattern matching over literals, identifiers, and discriminated unions.

```tsb
type Event =
  | { kind: "Hello"; who: string }
  | { kind: "Bye" };

export function announce(e: Event): string {
  return match e {
    { kind: "Hello" } => `hi, ${e.who}`,
    { kind: "Bye" }   => "bye",
    _                 => "?",
  };
}
```

Lowers to an IIFE with `if (…) return …;` chains — no runtime support code needed.

### Traits

Declare a contract once; implement it for many structs. The trait body lists method signatures (required) and default methods with `{}` bodies (inherited unless overridden).

```tsb
trait Display {
  display(self: Self): string;
  priceLabel(self: Self): string {
    return `${Self.display(self)} — see priceCents`;
  }
}

impl Display for Product {
  display(self: Product): string { return self.name; }
  // priceLabel inherits the default — `Self` is substituted with Product.
}
```

The compiler emits a generic `interface Display<Self>` and a const-to-const assignment (`const __Product_satisfies_0: Display<Product> = Product;`) so missing or mistyped trait methods surface as TS errors. Default methods are inlined onto each impl's `const` with `Self` rewritten to the concrete type — there's no runtime trait table or dynamic dispatch.

Limits: same-module trait lookup only (cross-module impls work but don't fill defaults), no trait bounds in generics yet, no `dyn Trait`.

### From / Into

```tsb
struct ProductId { value: string }

impl From<string> for ProductId {
  from(value: string): ProductId { return { value }; }
}

impl From<number> for ProductId {
  from(value: number): ProductId { return { value: `n-${value}` }; }
}
```

Multiple `impl From<T>` blocks naming their method `from` collapse into a single overloaded `ProductId.from(...)` with `typeof` discrimination at runtime. Different method names (`fromString`, `fromBuffer`) keep both as escape hatches.

### Function-attribute macros

Each macro contributes an entry to a per-file `export const` record. The user merges those records across files in their entry point.

| Macro | Contributes to |
| --- | --- |
| `#[get/post/put/patch/delete/head/options("/path")]` | `routes` (Bun.serve table), `openapi` (3.1 path operation), `client` (typed fetch wrapper) |
| `#[command("name", "description?")]` | `commands` (`{ name: { description, params, handler } }`) |
| `#[derive(Event)]` (on a struct) | `events` (marker record naming the payload type) |
| `#[onEvent("EventName")]` | `listeners` (`{ EventName: [handler, …] }`) |
| `#[sql("query-name")]` | replaces the function body with a prepared-statement call against the `db` param |

```tsb
#[get("/products/:id")]
export function getProduct(id: string): Product { … }

#[post("/products")]
export function createProduct(body: CreateProductDto): Product { … }

#[command("add", "Add a book")]
export function addBook(isbn: string, title: string): void { … }

#[sql("get-book-by-id")]
export function getBookById(db: Database, id: string): Book | undefined {}

#[onEvent("BookAdded")]
export async function logBookAdded(event: BookAdded): Promise<void> { … }
```

`#[sql]` reads `sql/<name>.sql` from the nearest `sql/` directory up the tree, rewrites `:name` placeholders to positional `?`, and chooses `.get/.all/.run` from the SQL kind and the function's return type. `RETURNING` clauses on mutations return the row. The database connection is an explicit first parameter — no DI, no hidden state.

### User macros

A macro module exports an array of macros that bunny loads via `--macro`:

```ts
// my-macros.ts
import type { FieldConstraintMacro } from "@flying-dice/bunny/macro";

const positive: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "positive",
  emit(_ctx, { field }) {
    return [`if (data.${field.name} <= 0) throw new Error("${field.name} must be > 0");`];
  },
};

export default [positive];
```

```bash
bunny compile main.tsb --macro ./my-macros.ts
```

The `@flying-dice/bunny/macro` import resolves to a type-only module, so the macro file ships with zero runtime dependency on bunny itself.

## Examples

Each example regenerates with `bun run example:<name>` and includes a runnable entrypoint.

| Example | Demonstrates |
| --- | --- |
| [`examples/api`](./examples/api/) | structs + derives, `#[get/post]`, per-controller `routes` + `openapi` merged in `server.ts` |
| [`examples/cli`](./examples/cli/) | `#[command]`, per-file `commands` const + 30-line `cli.ts` dispatcher, `#[deep]` validation chain (Isbn → AddBookDto → Book) |
| [`examples/csr`](./examples/csr/) | api backend in `.tsb`, React frontend imports the per-file `client` const for typed fetch |
| [`examples/sql`](./examples/sql/) | `#[sql]` against `bun:sqlite` (incl. `RETURNING`); per-file `listeners` + 6-line bus in `run.ts` |
| [`examples/ssr`](./examples/ssr/) | `.tsb` entities/services with `.tsx` controllers streaming HTML via `renderToReadableStream` |

## Editor support

A Zed extension lives at [`zed/`](./zed/). Install it via **zed: install dev extension** in the Zed command palette. It launches `bunny lsp` for diagnostics, completion, hover, and goto-definition. See [`zed/README.md`](./zed/README.md).

A VS Code scaffold lives at [`vscode/`](./vscode/) but is unfinished — install Zed for the maintained editor path.

## Limits

Honest caveats:

- The TextMate grammar reuses TypeScript's, so `struct`/`impl`/`match`/`#[…]` aren't highlighted as keywords. The LSP still provides completion and diagnostics.
- The route adapter binds non-path params from the JSON body on POST/PUT/PATCH and from the query string elsewhere. There's no body-shape inference — the user's function signature is the contract.
- The macros emit per-file consts; cross-file merging is your responsibility (one line per import + spread). Adding a new controller means adding a new import to `server.ts`. If you'd rather have auto-discovery, write a glob-import in your entry — bunny's compiler doesn't do it for you on purpose.
- `match` patterns cover literals, identifiers, and one-level discriminants — no nested destructuring or guard clauses yet.

## License

MIT.
