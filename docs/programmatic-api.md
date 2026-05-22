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
} from "@flying-dice/bunny";
```

## `generate(options)` — OpenAPI spec only

Returns the OpenAPI 3.1 document as an object. Doesn't touch disk.

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

## `generateBun(options)` — DI + routes module source

Returns `{ app, routes }` — both are strings of TypeScript source. Write them as `app.ts` and `routes.ts` in the same directory.

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

## `runCli(options)` — the CLI entry point

The exact entry point the `bunny` binary calls. Useful in build scripts that want CLI semantics (rc loading, flag parsing) without forking a subprocess.

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

| Export                    | What it does                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `safeInvoke(fn)`          | Wraps a handler. Maps `RequestValidationError` → 400, anything else → 500.         |
| `applyValidation(req, …)` | Runs the per-route validators; throws `RequestValidationError` on failure.         |
| `AssertionError`          | Thrown by generated `assertX` helpers. Carries `path` + `reason`.                  |
| `RequestValidationError`  | Thrown by `applyValidation`. The 400 contract is built from its fields.            |
| `FORMATS`                 | Mutable map of `@format` predicates. Extend it to register custom formats.         |

`FORMATS.slug = (s) => /^[a-z0-9-]+$/.test(s)` is the supported way to add new formats — see [Validation](./validation.md#adding-your-own).

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

## Example: a custom build script

If you don't want the CLI in the loop, compose the two generators directly:

```ts
// scripts/generate.ts
import { generate, generateBun } from "@flying-dice/bunny";
import * as path from "node:path";

const sourceFiles = "src/**/*.ts";
const outDir = path.resolve("src/generated");
const profile = process.env.PROFILE ?? "default";

const spec = generate({
  sourceFiles,
  base: { info: { title: "Users API", version: process.env.VERSION ?? "0.0.0" } },
});
await Bun.write(path.join(outDir, "openapi.json"), JSON.stringify(spec, null, 2));

const { app, routes } = generateBun({ sourceFiles, outDir, profile });
await Bun.write(path.join(outDir, "app.ts"), app);
await Bun.write(path.join(outDir, "routes.ts"), routes);

console.log(`generated under profile "${profile}"`);
```

Run with `PROFILE=production bun scripts/generate.ts`.
