#!/usr/bin/env bun
import * as path from "node:path";
import { parseArgs } from "node:util";
import type { oas31 } from "openapi3-ts";
import rc from "rc";
import { generateBun } from "./bun.ts";
import { generate } from "./generator.ts";

/**
 * Shape of `.bunnyrc` (JSON or INI). Every field is also reachable as a
 * matching CLI flag; CLI flags override the file. See `bunx @flying-dice/bunny --help`.
 *
 * `outDir` is the convention: the OpenAPI spec is written to
 * `{outDir}/openapi.json` (or `.yaml` when `format: "yaml"`) and the Bun
 * routes module to `{outDir}/index.ts`. Override the format with
 * `--format` / `format` and the validator toggle with `--validate` /
 * `--no-validate` / `validate`.
 */
export interface Config {
  sourceFiles?: string | string[];
  tsConfigFilePath?: string;
  outDir?: string;
  format?: "json" | "yaml";
  base?: Partial<oas31.OpenAPIObject>;
  validate?: boolean;
  runtimeImport?: string;
  /**
   * Active profile for `@profile`-tagged services. Services with no
   * `@profile` tag match every profile; services with a tag only match
   * the exact name. Defaults to `"default"`.
   */
  profile?: string;
}

type Target = "openapi" | "bun";
const ALL_TARGETS: readonly Target[] = ["openapi", "bun"];

export interface RunCliOptions {
  argv?: string[];
  cwd?: string;
  log?: (msg: string) => void;
}

/**
 * Entry point usable both from `bunx` and from tests. Returns the absolute
 * paths it wrote. Throws on configuration / generation errors; the binary
 * wraps this to render a clean error message.
 */
export async function runCli(opts: RunCliOptions = {}): Promise<string[]> {
  const argv = opts.argv ?? process.argv.slice(2);
  const cwd = opts.cwd ?? process.cwd();
  const log = opts.log ?? ((m) => console.log(m));

  const { values, positionals } = parse(argv);
  if (values.help) {
    log(USAGE);
    return [];
  }

  const rcLoaded = loadRcFromCwd(cwd);
  const fromCli = buildConfigFromCli(values);
  const merged = mergeConfig(rcLoaded?.config ?? {}, fromCli);

  if (!merged.sourceFiles) {
    throw new Error(`bunny: --source <glob> is required (or sourceFiles in .bunnyrc).\n\n${USAGE}`);
  }

  // Paths in the rc file resolve relative to the file's directory; paths on
  // the CLI resolve relative to cwd.
  const sourcesBase = fromCli.sourceFiles ? cwd : (rcLoaded?.dir ?? cwd);
  const outDirBase = fromCli.outDir ? cwd : (rcLoaded?.dir ?? cwd);
  const tsCfgBase = fromCli.tsConfigFilePath ? cwd : (rcLoaded?.dir ?? cwd);

  const resolved: Config = {
    ...merged,
    sourceFiles: resolveGlobs(merged.sourceFiles, sourcesBase),
    outDir: merged.outDir ? path.resolve(outDirBase, merged.outDir) : cwd,
    tsConfigFilePath: merged.tsConfigFilePath
      ? path.resolve(tsCfgBase, merged.tsConfigFilePath)
      : undefined,
  };

  const requested = parseTargets(positionals);
  const written: string[] = [];
  for (const target of requested) {
    const out = await runTarget(target, resolved);
    if (!out) continue;
    for (const p of Array.isArray(out) ? out : [out]) {
      written.push(p);
      log(`wrote ${path.relative(cwd, p) || p}`);
    }
  }
  return written;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

type CliValues = {
  help?: boolean;
  source?: string[];
  "ts-config"?: string;
  "out-dir"?: string;
  format?: string;
  validate?: boolean;
  "no-validate"?: boolean;
  profile?: string;
};

function parse(argv: string[]): { values: CliValues; positionals: string[] } {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        source: { type: "string", short: "s", multiple: true },
        "ts-config": { type: "string" },
        "out-dir": { type: "string", short: "o" },
        format: { type: "string" },
        validate: { type: "boolean" },
        "no-validate": { type: "boolean" },
        profile: { type: "string", short: "p" },
      },
    }) as { values: CliValues; positionals: string[] };
  } catch (err) {
    throw new Error(`bunny: ${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
  }
}

function buildConfigFromCli(v: CliValues): Config {
  const out: Config = {};
  if (v.source && v.source.length > 0) {
    out.sourceFiles = v.source.length === 1 ? v.source[0]! : v.source;
  }
  if (v["ts-config"]) out.tsConfigFilePath = v["ts-config"];
  if (v["out-dir"]) out.outDir = v["out-dir"];
  if (v.format) {
    if (v.format !== "json" && v.format !== "yaml") {
      throw new Error(`bunny: --format must be "json" or "yaml" (got "${v.format}")`);
    }
    out.format = v.format;
  }
  if (v.validate) out.validate = true;
  if (v["no-validate"]) out.validate = false;
  if (v.profile) out.profile = v.profile;
  return out;
}

function parseTargets(positionals: string[]): Target[] {
  if (positionals.length === 0) return [...ALL_TARGETS];
  const out: Target[] = [];
  for (const arg of positionals) {
    if (arg === "all") return [...ALL_TARGETS];
    if (!ALL_TARGETS.includes(arg as Target)) {
      throw new Error(
        `bunny: unknown target "${arg}". Expected one of: ${["all", ...ALL_TARGETS].join(", ")}.`
      );
    }
    out.push(arg as Target);
  }
  return out;
}

// ---------------------------------------------------------------------------
// rc loader (skipping its built-in argv parsing — we do that ourselves)
// ---------------------------------------------------------------------------

interface LoadedRc {
  config: Config;
  dir: string;
}

function loadRcFromCwd(cwd: string): LoadedRc | null {
  const originalCwd = process.cwd();
  let changed = false;
  if (cwd !== originalCwd) {
    process.chdir(cwd);
    changed = true;
  }
  try {
    const raw = rc("bunny", {}, {} as never) as Record<string, unknown> & {
      _?: unknown;
      config?: string;
      configs?: string[];
    };
    const configPath = typeof raw.config === "string" ? raw.config : undefined;
    if (!configPath) return null;
    const { _: _ignored, config, configs, ...clean } = raw;
    return { config: clean as Config, dir: path.dirname(configPath) };
  } finally {
    if (changed) process.chdir(originalCwd);
  }
}

// ---------------------------------------------------------------------------
// Config merge & path resolution
// ---------------------------------------------------------------------------

function mergeConfig(base: Config, overrides: Config): Config {
  return { ...base, ...overrides };
}

function resolveGlobs(globs: string | string[], base: string): string | string[] {
  const arr = Array.isArray(globs) ? globs : [globs];
  const out = arr.map((g) => (path.isAbsolute(g) ? g : path.join(base, g)));
  return Array.isArray(globs) ? out : out[0]!;
}

// ---------------------------------------------------------------------------
// Target execution
// ---------------------------------------------------------------------------

async function runTarget(target: Target, config: Config): Promise<string | string[] | null> {
  const outDir = config.outDir!;
  const fmt = config.format ?? "json";

  if (target === "openapi") {
    const outFile = path.join(outDir, fmt === "yaml" ? "openapi.yaml" : "openapi.json");
    const spec = generate({
      sourceFiles: config.sourceFiles!,
      tsConfigFilePath: config.tsConfigFilePath,
      base: config.base,
    });
    if (fmt === "yaml") {
      const { oas31: oas } = await import("openapi3-ts");
      await Bun.write(outFile, oas.OpenApiBuilder.create(spec).getSpecAsYaml());
    } else {
      await Bun.write(outFile, JSON.stringify(spec, null, 2));
    }
    return outFile;
  }

  if (target === "bun") {
    const { app, routes } = generateBun({
      sourceFiles: config.sourceFiles!,
      tsConfigFilePath: config.tsConfigFilePath,
      outDir,
      validate: config.validate,
      runtimeImport: config.runtimeImport,
      profile: config.profile,
    });
    const appPath = path.join(outDir, "app.ts");
    const routesPath = path.join(outDir, "routes.ts");
    await Bun.write(appPath, app);
    await Bun.write(routesPath, routes);
    return [appPath, routesPath];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Usage banner
// ---------------------------------------------------------------------------

const USAGE = `\
Usage: bunx @flying-dice/bunny [target ...] [flags]   (or "bunny [target ...]" once installed)

Targets:
  openapi       Generate the OpenAPI spec.
  bun           Generate the DI wiring + Bun.serve handlers.
  all           Run every target (the default when no target is given).

Outputs are conventional, written into the directory chosen by --out-dir:

  {outDir}/openapi.json   (or openapi.yaml when --format yaml)
  {outDir}/app.ts         (DI wiring — singletons exported by name)
  {outDir}/routes.ts      (default-exports the spreadable Bun.serve 'routes' object)

Flags (override any matching .bunnyrc value):
  -h, --help                  Show this message.
  -s, --source <glob>         Source glob(s) to scan. Repeat for multiple. Required.
  -o, --out-dir <dir>         Directory to write outputs into. Defaults to cwd.
      --ts-config <path>      Path to a tsconfig.json.
      --format <json|yaml>    OpenAPI output format (default: json).
      --validate              Emit runtime validation (the default).
      --no-validate           Skip runtime validation.
  -p, --profile <name>        Active profile for @profile-tagged services
                              (default: "default").

Optional config: .bunnyrc (JSON or INI) discovered by walking up from the
current directory. See README for the file schema.
`;

// ---------------------------------------------------------------------------

const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  try {
    await runCli();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
