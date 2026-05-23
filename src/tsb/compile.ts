/**
 * One-shot transpile entry point. Reads a `.tsb` file, runs the rewriter,
 * writes the resulting TypeScript to disk (alongside the source by default,
 * or to a user-specified path).
 *
 * Source maps will land here when task #48 ships.
 */
import * as path from "node:path";
import { appendSourceMappingURL, generateSourceMap } from "./sourcemap.ts";
import { transpile } from "./transpile.ts";

export interface CompileOptions {
  /** Path to the input `.tsb` file (absolute or cwd-relative). */
  input: string;
  /** Optional output path. Defaults to the input with `.tsb` swapped for `.ts`. */
  output?: string;
  /** Absolute or dynamically importable paths for user-authored macros. */
  macroModules?: string[];
}

export interface CompileResult {
  inputPath: string;
  outputPath: string;
  ts: string;
  diagnostics: { message: string; span: { start: number; end: number } }[];
}

export async function compileFile(opts: CompileOptions): Promise<CompileResult> {
  const inputPath = path.resolve(opts.input);
  const outputPath = opts.output
    ? path.resolve(opts.output)
    : defaultOutputPath(inputPath);

  const source = await Bun.file(inputPath).text();
  const { ts, diagnostics, chunks } = await transpile(source, {
    macroModules: opts.macroModules,
    sourcePath: inputPath,
  });
  const mapPath = `${outputPath}.map`;
  const mapBasename = path.basename(mapPath);
  const tsWithRef = appendSourceMappingURL(ts, mapBasename);
  const sourceMap = generateSourceMap(
    path.basename(outputPath),
    path.basename(inputPath),
    source,
    chunks
  );
  await Bun.write(outputPath, tsWithRef);
  await Bun.write(mapPath, JSON.stringify(sourceMap));
  return { inputPath, outputPath, ts: tsWithRef, diagnostics };
}

/**
 * `foo/bar/baz.tsb` -> `foo/bar/baz.ts`. Any other extension is preserved
 * as a sibling `.ts` (e.g. `baz.bunny.tsb` -> `baz.bunny.ts`).
 */
function defaultOutputPath(input: string): string {
  if (input.endsWith(".tsb")) return `${input.slice(0, -4)}.ts`;
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  return path.join(dir, `${base}.ts`);
}

/**
 * Multi-file compile + optional watch. Walks every `.tsb` matching
 * `sourceGlobs`, compiles each, optionally re-runs on file change.
 *
 * Watch mode debounces 200ms; .ts and .ts.map output writes are
 * ignored so codegen output doesn't bounce the watcher.
 */
export interface BuildOptions {
  sourceGlobs: string[];
  cwd: string;
  macroModules?: string[];
  watch?: boolean;
  /** Callback for log output (defaults to console.log). */
  log?: (msg: string) => void;
}

export async function buildProject(opts: BuildOptions): Promise<string[]> {
  const log = opts.log ?? ((m) => console.log(m));
  const files = await collectTsbFiles(opts.sourceGlobs, opts.cwd);
  const written: string[] = [];

  const compileOne = async (file: string): Promise<void> => {
    try {
      const result = await compileFile({
        input: file,
        macroModules: opts.macroModules,
      });
      for (const d of result.diagnostics) {
        log(`tsb: ${path.relative(opts.cwd, file)}: ${d.message} (${d.span.start}..${d.span.end})`);
      }
      written.push(result.outputPath);
      log(`wrote ${path.relative(opts.cwd, result.outputPath) || result.outputPath}`);
    } catch (err) {
      log(`tsb: ${path.relative(opts.cwd, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  for (const f of files) await compileOne(f);

  if (opts.watch) {
    log(`watching ${files.length} file${files.length === 1 ? "" : "s"} for changes…`);
    const { watch } = await import("node:fs");
    const dirs = new Set(files.map((f) => path.dirname(f)));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const dirty = new Set<string>();
    const flush = async (): Promise<void> => {
      const batch = [...dirty];
      dirty.clear();
      for (const f of batch) await compileOne(f);
    };
    for (const dir of dirs) {
      watch(dir, { recursive: false }, (_event, filename) => {
        if (!filename) return;
        if (!filename.endsWith(".tsb")) return;
        const full = path.resolve(dir, String(filename));
        dirty.add(full);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void flush(), 200);
      });
    }
    await new Promise<void>(() => {});
  }

  return written;
}

/**
 * Resolve a list of source globs (relative to `cwd`) into absolute `.tsb`
 * file paths. Uses `Bun.Glob` for matching — Bun's standard glob impl.
 */
async function collectTsbFiles(globs: string[], cwd: string): Promise<string[]> {
  const out = new Set<string>();
  for (const g of globs) {
    const glob = new Bun.Glob(g);
    for await (const match of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
      if (match.endsWith(".tsb")) out.add(match);
    }
  }
  return [...out].sort();
}
