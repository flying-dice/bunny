#!/usr/bin/env bun
import * as path from "node:path";
import { parseArgs } from "node:util";
import { buildCli } from "./tsb/cli-assembler.ts";
import { buildClient } from "./tsb/client-assembler.ts";
import { buildProject, compileFile } from "./tsb/compile.ts";
import { buildEvents } from "./tsb/events-assembler.ts";
import { runLsp } from "./tsb/lsp.ts";
import { generateOpenApi } from "./tsb/openapi.ts";
import { buildRoutes } from "./tsb/routes-assembler.ts";

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
  if (values.help || positionals.length === 0) {
    log(USAGE);
    return [];
  }

  const cmd = positionals[0];
  const macroModules = (values.macro ?? []).map((p: string) => path.resolve(cwd, p));
  const sourceGlobs = values.source ?? [];
  const output = values["out-dir"];

  // `bunny lsp` — stdio language server for the Zed/VS Code extensions.
  if (cmd === "lsp") {
    await runLsp();
    return [];
  }

  // `bunny build -s <glob>... [--watch]` — multi-file tsb compile.
  if (cmd === "build") {
    requireSource(sourceGlobs);
    return await buildProject({
      sourceGlobs,
      cwd,
      macroModules,
      watch: values.watch ?? false,
      log,
    });
  }

  // `bunny compile <file.tsb> [-o out.ts]` — one-shot tsb transpile.
  if (cmd === "compile") {
    const input = positionals[1];
    if (!input) {
      throw new Error(`bunny: compile requires an input file.\n\n${USAGE}`);
    }
    const result = await compileFile({
      input: path.resolve(cwd, input),
      output: output ? path.resolve(cwd, output) : undefined,
      macroModules,
    });
    for (const d of result.diagnostics) {
      log(`tsb: ${d.message} (${d.span.start}..${d.span.end})`);
    }
    log(`wrote ${path.relative(cwd, result.outputPath) || result.outputPath}`);
    return [result.outputPath];
  }

  // `bunny cli` — emit a CLI dispatcher from #[command] descriptors.
  if (cmd === "cli") {
    requireSource(sourceGlobs);
    return [await buildCli({ sourceGlobs, cwd, macroModules, output, log })];
  }

  // `bunny routes` — emit a Bun.serve route table from #[get/post/...].
  if (cmd === "routes") {
    requireSource(sourceGlobs);
    return [await buildRoutes({ sourceGlobs, cwd, macroModules, output, log })];
  }

  // `bunny client` — emit a typed fetch client from #[get/post/...].
  if (cmd === "client") {
    requireSource(sourceGlobs);
    return [await buildClient({ sourceGlobs, cwd, macroModules, output, log })];
  }

  // `bunny events` — emit a typed pub/sub bus.
  if (cmd === "events") {
    requireSource(sourceGlobs);
    return [await buildEvents({ sourceGlobs, cwd, macroModules, output, log })];
  }

  // `bunny openapi` — emit the OpenAPI 3.1 document.
  if (cmd === "openapi") {
    requireSource(sourceGlobs);
    const doc = await generateOpenApi({
      sourceGlobs,
      cwd,
      macroModules,
      output,
      log,
    });
    if (!output) log(JSON.stringify(doc, null, 2));
    return output ? [path.resolve(cwd, output)] : [];
  }

  throw new Error(`bunny: unknown command "${cmd}"\n\n${USAGE}`);
}

function requireSource(globs: readonly string[]): void {
  if (globs.length === 0) {
    throw new Error(`bunny: -s/--source <glob> is required for this command.\n\n${USAGE}`);
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

type CliValues = {
  help?: boolean;
  source?: string[];
  "out-dir"?: string;
  watch?: boolean;
  macro?: string[];
};

function parse(argv: string[]): { values: CliValues; positionals: string[] } {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        source: { type: "string", short: "s", multiple: true },
        "out-dir": { type: "string", short: "o" },
        watch: { type: "boolean", short: "w" },
        macro: { type: "string", multiple: true },
      },
    }) as { values: CliValues; positionals: string[] };
  } catch (err) {
    throw new Error(`bunny: ${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
  }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const USAGE = `\
Usage: bunny <command> [flags]

Commands:
  build    -s <glob>... [-w]            Compile every matching .tsb to sibling .ts.
  compile  <file.tsb> [-o out.ts]       Transpile a single .tsb file.
  routes   -s <glob>... [-o routes.ts]  Emit a Bun.serve route table.
  cli      -s <glob>... [-o cli-app.ts] Emit a CLI dispatcher from #[command].
  client   -s <glob>... [-o client.ts]  Emit a typed fetch client from #[get/post/...].
  events   -s <glob>... [-o bus.ts]     Emit a typed event bus from #[derive(Event)] + #[onEvent].
  openapi  -s <glob>... [-o spec.json]  Emit the OpenAPI 3.1 spec.
  lsp                                   Stdio language server (used by editors).

Flags:
  -h, --help                  Show this message.
  -s, --source <glob>         Source glob(s). Repeat for multiple.
  -o, --out-dir <path>        Output path (semantics differ per command).
  -w, --watch                 Watch sources and rebuild on change (build only).
      --macro <path>          Load user-authored macros from this module. Repeatable.
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
