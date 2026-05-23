#!/usr/bin/env bun
import * as path from "node:path";
import { parseArgs } from "node:util";
import { buildProject, compileFile, runTests } from "./neoc/driver.ts";
import { runLsp } from "./neoc/lsp.ts";

export interface RunCliOptions {
  argv?: string[];
  cwd?: string;
  log?: (msg: string) => void;
}

/**
 * Entry point. Returns the absolute paths it wrote. Throws on
 * configuration / compile errors; the binary wraps this to render a
 * clean error message.
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

  // `neoc lsp` — stdio language server for editor extensions.
  if (cmd === "lsp") {
    await runLsp();
    return [];
  }

  // `neoc build -s <glob>... [--watch]` — multi-file neoc compile.
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

  // `neoc test -s <glob>...` — compile + run every `#[test]` function.
  if (cmd === "test") {
    const globs = sourceGlobs.length > 0 ? sourceGlobs : ["**/*.neoc"];
    const result = await runTests({
      sourceGlobs: globs,
      cwd,
      macroModules,
      log,
    });
    if (result.failed > 0) process.exit(1);
    return [];
  }

  // `neoc compile <file.neoc> [-o out.lua]` — one-shot neoc transpile.
  if (cmd === "compile") {
    const input = positionals[1];
    if (!input) {
      throw new Error(`neoc: compile requires an input file.\n\n${USAGE}`);
    }
    const result = await compileFile({
      input: path.resolve(cwd, input),
      output: values["out-dir"] ? path.resolve(cwd, values["out-dir"]) : undefined,
      macroModules,
    });
    for (const d of result.diagnostics) {
      log(`neoc: ${d.message} (${d.span.start}..${d.span.end})`);
    }
    log(`wrote ${path.relative(cwd, result.outputPath) || result.outputPath}`);
    return [result.outputPath];
  }

  throw new Error(`neoc: unknown command "${cmd}"\n\n${USAGE}`);
}

function requireSource(globs: readonly string[]): void {
  if (globs.length === 0) {
    throw new Error(`neoc: -s/--source <glob> is required for this command.\n\n${USAGE}`);
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
    throw new Error(`neoc: ${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
  }
}

// ---------------------------------------------------------------------------

const USAGE = `\
Usage: neoc <command> [flags]

Commands:
  build    -s <glob>... [-w]       Compile every matching .neoc to sibling .lua.
  compile  <file.neoc> [-o out.lua] Transpile a single .neoc file.
  test     [-s <glob>...]           Compile + run every #[test] function.
  lsp                              Stdio language server (used by editors).

Flags:
  -h, --help                  Show this message.
  -s, --source <glob>         Source glob(s). Repeat for multiple.
  -o, --out-dir <path>        Output path for \`compile\`.
  -w, --watch                 Watch sources and rebuild on change.
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
