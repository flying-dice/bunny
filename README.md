# Bunny

> 🐰 A Rust-flavoured TypeScript dialect for Bun. `.tsb` files transpile to plain `.ts` — runtime has zero dependency on `@flying-dice/bunny`.

Bunny adds **`struct`**, **`impl`**, **`match`**, and **`#[macro]` attributes** to TypeScript. The compiler transpiles `.tsb` → `.ts` and ships a small set of project-level assemblers that scan macro descriptors across files to emit:

- a typed route table for `Bun.serve`
- a typed `fetch` client matching the route signatures
- a CLI dispatcher from `#[command]`-tagged functions
- a typed event bus from `#[derive(Event)]` + `#[onEvent]`
- an OpenAPI 3.1 spec

You write `.tsb`; bunny writes `.ts`. After codegen, your app has no runtime dependency on this package.

## Install

```bash
bun add -d @flying-dice/bunny
```

Requires Bun ≥ 1.3 and TypeScript ≥ 5.

## Hello, tsb

`hello.tsb`:

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
```

Compile it:

```bash
bunny compile hello.tsb           # → hello.ts
```

`hello.ts` is plain TypeScript: a `type Product = { … }`, a `const Product = { new(data): …, clone(self): …, equals(a, b): …, toJson(self): … }`, the `getProduct` function, and a `__route_getProduct` descriptor the assemblers later harvest.

## Commands

```
bunny build    -s <glob>... [-w]            Compile every matching .tsb → sibling .ts.
bunny compile  <file.tsb> [-o out.ts]       Transpile one file.
bunny routes   -s <glob>... [-o routes.ts]  Emit a Bun.serve route table.
bunny client   -s <glob>... [-o client.ts]  Emit a typed fetch client.
bunny cli      -s <glob>... [-o cli-app.ts] Emit a CLI dispatcher from #[command].
bunny events   -s <glob>... [-o bus.ts]     Emit a typed event bus.
bunny openapi  -s <glob>... [-o spec.json]  Emit the OpenAPI 3.1 spec.
bunny lsp                                   Stdio language server for editors.
```

Every command takes `--source`/`-s` (repeatable globs) and `--macro` (paths to user-authored macro modules). The output flag (`-o`) names the emitted file; the assemblers (`routes`, `client`, `cli`, `events`, `openapi`) also recompile their input `.tsb` files as a side-effect.

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

```tsb
#[get("/products/:id")]
export function getProduct(id: string): Product { … }

#[post("/products")]
export function createProduct(body: CreateProductDto): Product { … }

#[command("add", "Add a book")]
export function addBook(isbn: string, title: string): void { … }

#[sql("get-book-by-id")]
export function getBookById(db: Database, id: string): Book | undefined {}

#[onEvent(BookAdded)]
export async function logBookAdded(event: BookAdded): Promise<void> { … }
```

Each macro emits a sibling `__<kind>_<fn>` descriptor that the corresponding assembler harvests across the project.

- `#[get/post/put/patch/delete/head/options(path)]` → harvested by `bunny routes`, `bunny client`, `bunny openapi`.
- `#[command(name, description?)]` → harvested by `bunny cli`.
- `#[sql(name)]` → reads `sql/<name>.sql` from the nearest `sql/` directory up the tree, rewrites `:name` placeholders to positional `?`, and chooses `.get/.all/.run` from the SQL kind and the function's return type. `RETURNING` clauses on mutations return the row.
- `#[onEvent(EventName)]` → harvested by `bunny events`.

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
| [`examples/api`](./examples/api/) | structs + derives, `#[get/post]`, `bunny routes`, `bunny openapi`, `Bun.serve` |
| [`examples/cli`](./examples/cli/) | `#[command]`, `bunny cli`, `#[deep]` validation chaining (Isbn → AddBookDto → Book) |
| [`examples/csr`](./examples/csr/) | api backend in `.tsb`, React frontend in `.tsx` consuming the generated `bunny client` |
| [`examples/sql`](./examples/sql/) | `#[sql]` against `bun:sqlite`, including `RETURNING`-aware dispatch; events round-trip |
| [`examples/ssr`](./examples/ssr/) | `.tsb` entities/services with `.tsx` controllers streaming HTML via `renderToReadableStream` |

## Editor support

A Zed extension lives at [`zed/`](./zed/). Install it via **zed: install dev extension** in the Zed command palette. It launches `bunny lsp` for diagnostics, completion, hover, and goto-definition. See [`zed/README.md`](./zed/README.md).

A VS Code scaffold lives at [`vscode/`](./vscode/) but is unfinished — install Zed for the maintained editor path.

## Limits

Honest caveats:

- The TextMate grammar reuses TypeScript's, so `struct`/`impl`/`match`/`#[…]` aren't highlighted as keywords. The LSP still provides completion and diagnostics.
- The route adapter binds non-path params from the JSON body on POST/PUT/PATCH and from the query string elsewhere. There's no body-shape inference — the user's function signature is the contract.
- `bunny routes` doesn't scan `.tsx`. SSR examples wire their controllers manually.
- `match` patterns cover literals, identifiers, and one-level discriminants — no nested destructuring or guard clauses yet.

## License

MIT.
