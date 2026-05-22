# CLI

```
Usage: bunx @flying-dice/bunny [target ...] [flags]   (or "bunny [target ...]" once installed)
```

`bunx @flying-dice/bunny` for one-shot use without installing. After `bun add @flying-dice/bunny`, the `bunny` binary is on your project's `node_modules/.bin`.

## Quick reference

```bash
# All targets, conventional output directory
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated

# OpenAPI only
bunx @flying-dice/bunny openapi -s 'src/**/*.ts' -o src/generated

# Bun handlers only (skips openapi.json)
bunx @flying-dice/bunny bun -s 'src/**/*.ts' -o src/generated

# YAML output
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated --format yaml

# Multiple source globs
bunx @flying-dice/bunny -s 'src/api/**/*.ts' -s 'src/admin/**/*.ts' -o src/generated

# Active profile (for @profile-tagged services)
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated --profile production

# Skip runtime validation emission
bunx @flying-dice/bunny -s 'src/**/*.ts' -o src/generated --no-validate

bunx @flying-dice/bunny --help
```

## Outputs by convention

Outputs live inside the directory chosen by `-o` / `--out-dir`:

```
{outDir}/
├── openapi.json    (or openapi.yaml with --format yaml)
├── app.ts          DI wiring — singletons exported by name
└── routes.ts       Spreadable handlers + per-route validators
```

`app.ts` and `routes.ts` import each other; treat them as a pair. Commit both to source control.

## Flags

| Flag                       | Effect                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| `-s, --source <glob>`      | Source glob to scan. **Required.** Repeat for multiple globs.                   |
| `-o, --out-dir <dir>`      | Directory to write outputs into. Defaults to the current working directory.     |
| `--ts-config <path>`       | Path to a `tsconfig.json`. Otherwise ts-morph loads standalone.                 |
| `--format <json\|yaml>`    | OpenAPI output format. Default `json`.                                          |
| `-p, --profile <name>`     | Active profile for `@profile`-tagged services. Default `"default"`.             |
| `--validate`               | Emit runtime validation (the default).                                          |
| `--no-validate`            | Skip validator emission. `safeInvoke` still wraps every handler.                |
| `-h, --help`               | Show usage.                                                                     |

## Targets

Positional arguments after the flags select which artifacts to emit:

| Target    | Emits                                                |
| --------- | ---------------------------------------------------- |
| `openapi` | `openapi.{json,yaml}` only.                          |
| `bun`     | `app.ts` + `routes.ts` only.                         |
| `all`     | Everything. **Default when no target is given.**     |

`bunx @flying-dice/bunny openapi -s ... -o ...` is the fast iteration loop when you're only checking the spec.

## `.bunnyrc`

Anything you'd otherwise repeat on the CLI can live in a `.bunnyrc` (JSON or INI) at your project root. Discovered by walking up from the working directory via [rc](https://www.npmjs.com/package/rc).

```json
{
  "sourceFiles": ["src/**/*.ts"],
  "outDir": "src/generated",
  "format": "json",
  "profile": "default",
  "validate": true,
  "base": {
    "info": { "title": "Users API", "version": "1.2.0" },
    "servers": [{ "url": "https://api.example.com" }]
  }
}
```

**CLI flags always override file values.** Paths in the rc file resolve relative to the file's directory; paths on the CLI resolve relative to `cwd`.

With the file above:

```bash
bunx @flying-dice/bunny                             # all targets
bunx @flying-dice/bunny openapi                     # only the spec
bunx @flying-dice/bunny --profile production        # rc + flag override
```

### Recognised fields

| Field             | Type                          | Equivalent flag         |
| ----------------- | ----------------------------- | ----------------------- |
| `sourceFiles`     | `string \| string[]`          | `-s` / `--source`       |
| `outDir`          | `string`                      | `-o` / `--out-dir`      |
| `tsConfigFilePath`| `string`                      | `--ts-config`           |
| `format`          | `"json" \| "yaml"`            | `--format`              |
| `profile`         | `string`                      | `-p` / `--profile`      |
| `validate`        | `boolean`                     | `--validate` / `--no-validate` |
| `base`            | `Partial<OpenAPIObject>`      | *(no flag; rc-only)*    |
| `runtimeImport`   | `string`                      | *(no flag; rc-only)*    |

`runtimeImport` overrides the import specifier the generated `routes.ts` uses for runtime helpers — default `"@flying-dice/bunny"`. Useful when you're vendoring or aliasing.

## Run straight from a GitHub repo

`bunx` accepts Bun's installer spec. Handy for CI or trial runs without `bun add`:

```bash
bunx github:flying-dice/bunny --help
bunx github:flying-dice/bunny#v0.1.0 openapi -s 'src/**/*.ts' -o src/generated
```

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | All requested targets emitted.                                          |
| `1`  | Configuration error, discovery error, or generation error. Stderr has the `bunny: …` message. |

The CLI prints `wrote <path>` for each file emitted on success. Pipe stderr separately if you only want the written-paths list.

### Exit-1 error families

Every error message is prefixed `bunny:` for easy grep. The common ones:

| Trigger                                  | Stderr (excerpt)                                                  |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Missing `--source` and no rc value       | `bunny: --source <glob> is required (or sourceFiles in .bunnyrc)` |
| Invalid `--format`                       | `bunny: --format must be "json" or "yaml" (got "csv")`            |
| Unknown target                           | `bunny: unknown target "wat". Expected one of: all, openapi, bun.`|
| Discovery error (e.g. duplicate operationId) | `bunny: duplicate operationId(s) across controllers …`        |
| DI resolution error                      | `bunny: <Class>.constructor(…) — no active service @provides …`   |
| `@provides` token doesn't resolve        | `bunny: <Class>: @provides X — class does not implement, extend, or equal "X"` |
| `@inject` dependency cycle               | `bunny: @inject dependency cycle: A → B → A`                      |

See [Dependency injection](./dependency-injection.md#common-errors) for the full DI error table.
