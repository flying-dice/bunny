# Programmatic API

The CLI is a thin wrapper. Everything is reachable from TypeScript via the package root.

```ts
import {
  generate,
  generateBun,
  runCli,
  type Config,
  type GenerateOptions,
  type GenerateBunOptions,
  type GenerateBunOutput,
  type RunCliOptions,
} from "@flying-dice/bunny";
```

## `generate(options): oas31.OpenAPIObject`

Returns the OpenAPI 3.1 document as an object (from [`openapi3-ts`](https://www.npmjs.com/package/openapi3-ts)). Doesn't touch disk.

```ts
import { generate } from "@flying-dice/bunny";

const spec = generate({
  sourceFiles: "src/**/*.ts",
  base: {
    info: { title: "Users API", version: "1.0.0" },
  },
});

await Bun.write("openapi.json", JSON.stringify(spec, null, 2));
```

### `GenerateOptions`

| Field              | Type                          | Default                   |
| ------------------ | ----------------------------- | ------------------------- |
| `sourceFiles`      | `string \| string[]`          | **required**              |
| `tsConfigFilePath` | `string`                      | none (standalone project) |
| `base`             | `Partial<OpenAPIObject>`      | minimal envelope          |

## `generateBun(options): GenerateBunOutput`

`GenerateBunOutput` is `{ app: string; routes: string }` — both are TypeScript source. Write them as `app.ts` and `routes.ts` in the same directory.

```ts
import { generateBun } from "@flying-dice/bunny";
import * as path from "node:path";

const outDir = path.resolve("src/generated");
const { app, routes } = generateBun({
  sourceFiles: "src/**/*.ts",
  outDir,
  profile: "production",
});

await Bun.write(path.join(outDir, "app.ts"), app);
await Bun.write(path.join(outDir, "routes.ts"), routes);
```

### `GenerateBunOptions`

| Field              | Type                          | Default                                |
| ------------------ | ----------------------------- | -------------------------------------- |
| `sourceFiles`      | `string \| string[]`          | **required**                           |
| `outDir`           | `string`                      | **required**                           |
| `tsConfigFilePath` | `string`                      | none                                   |
| `profile`          | `string`                      | `"default"`                            |
| `validate`         | `boolean`                     | `true` (emit validators)               |
| `runtimeImport`    | `string`                      | `"@flying-dice/bunny"`                 |

The `outDir` field is used to compute relative imports from the generated files back to your source files; you still need to write the files yourself.

## `runCli(options): Promise<string[]>`

The exact entry point the `bunny` binary calls. Useful in build scripts that want CLI semantics (rc loading, flag parsing) without forking a subprocess. Resolves to the absolute paths it wrote.

```ts
import { runCli } from "@flying-dice/bunny";

const written = await runCli({
  cwd: process.cwd(),
  argv: ["openapi", "-s", "src/**/*.ts", "-o", "src/generated"],
  log: (m) => console.log(m),
});

console.log("emitted:", written);
```

### `RunCliOptions`

| Field    | Type                          | Default                |
| -------- | ----------------------------- | ---------------------- |
| `cwd`    | `string`                      | `process.cwd()`        |
| `argv`   | `string[]`                    | `process.argv.slice(2)`|
| `log`    | `(msg: string) => void`       | `console.log`          |

Returns the absolute paths of every file written. Throws on configuration / generation errors; the binary catches the throw and prints a clean message to stderr.

## `Config`

The shape of `.bunnyrc`. Same fields whether you load it yourself or rely on the rc-walker built into `runCli`.

```ts
import type { Config } from "@flying-dice/bunny";

const config: Config = {
  sourceFiles: ["src/**/*.ts"],
  outDir: "src/generated",
  format: "json",
  profile: "default",
  validate: true,
  base: {
    info: { title: "API", version: "1.0.0" },
  },
};
```

See [CLI — `.bunnyrc`](./cli.md#bunnyrc) for the full field list.

## Runtime helpers (re-exported)

Used by the generated `routes.ts`. Most projects don't import them directly — they exist for advanced cases.

```ts
import {
  safeInvoke,
  applyValidation,
  AssertionError,
  RequestValidationError,
  FORMATS,
} from "@flying-dice/bunny";
```

### Signatures

```ts
function safeInvoke(fn: () => Promise<Response>): Promise<Response>;

function applyValidation(
  req: Request & { params?: any; query?: any },
  validators: {
    params?: (o: any) => void;
    query?:  (o: any) => void;
    body?:   (o: any) => void;
  },
): Promise<void>;

class AssertionError extends Error {
  readonly path: string;     // ".email", ".tags[2]", ""
  readonly reason: string;   // "expected string", "expected length >= 1", …
}

class RequestValidationError extends Error {
  readonly location: "params" | "query" | "body";
  readonly path: string;
  readonly reason: string;
}

const FORMATS: Record<string, (s: string) => boolean>;
```

### Behaviour to know if you hand-roll a handler

`applyValidation` mutates the request: after a successful body validation it replaces `req.json` with a function that returns the already-parsed body. Your handler can call `await req.json()` once without re-parsing. If you wrap handlers yourself (instead of using the generated `routes.ts`), preserve this contract — the consuming controller code expects it.

`safeInvoke`'s 400 / 500 JSON shape is the [error contract](./validation.md#error-contract); both error classes carry the fields that contract exposes. To swap the contract, write your own wrapper around `applyValidation` and skip `safeInvoke`.

Extending `FORMATS`:

```ts
FORMATS.slug = (s) => /^[a-z0-9-]+$/.test(s);
```

See [Validation — Adding your own](./validation.md#adding-your-own).

## Types

```ts
import type {
  TypedRequest,
  TypedResponse,
  JsonRequest,
  JsonResponse,
  TextRequest,
  TextResponse,
  HtmlRequest,
  HtmlResponse,
  XmlRequest,
  XmlResponse,
  FormRequest,
  MultipartRequest,
  Input,
  HttpMethod,
} from "@flying-dice/bunny";
```

These are pure type exports — fully erased at runtime. See [Controllers](./controllers.md#the-request) for the request/response shapes.

## Example: multi-profile build script

Generate one bundle per profile, each in its own output directory:

```ts
// scripts/generate.ts
import { generate, generateBun } from "@flying-dice/bunny";
import * as path from "node:path";

const sourceFiles = "src/**/*.ts";
const profiles = ["default", "production", "test"] as const;

for (const profile of profiles) {
  const outDir = path.resolve(`src/generated.${profile}`);

  const spec = generate({
    sourceFiles,
    base: {
      info: { title: "Users API", version: process.env.VERSION ?? "0.0.0" },
    },
  });
  await Bun.write(path.join(outDir, "openapi.json"), JSON.stringify(spec, null, 2));

  const { app, routes } = generateBun({ sourceFiles, outDir, profile });
  await Bun.write(path.join(outDir, "app.ts"), app);
  await Bun.write(path.join(outDir, "routes.ts"), routes);

  console.log(`profile "${profile}" → ${outDir}`);
}
```

Production code imports `from "./generated.production/routes.ts"`; the test setup imports `from "./generated.test/routes.ts"`. The OpenAPI document is the same shape across profiles (it doesn't depend on which impl is wired), so any profile's `openapi.json` works for documentation.
