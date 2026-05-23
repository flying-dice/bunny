/**
 * One-shot transpile entry point. Reads a `.neoc` file, runs the
 * rewriter, writes the resulting Lua to disk (alongside the source by
 * default, or to a user-specified path).
 */
import * as path from "node:path";
import { transpile } from "./compiler.ts";

export interface CompileOptions {
  /** Path to the input `.neoc` file (absolute or cwd-relative). */
  input: string;
  /** Optional output path. Defaults to the input with `.neoc` swapped for `.lua`. */
  output?: string;
  /** Absolute or dynamically importable paths for user-authored macros. */
  macroModules?: string[];
}

export interface CompileResult {
  inputPath: string;
  outputPath: string;
  lua: string;
  diagnostics: { message: string; span: { start: number; end: number } }[];
}

export async function compileFile(opts: CompileOptions): Promise<CompileResult> {
  const inputPath = path.resolve(opts.input);
  const outputPath = opts.output
    ? path.resolve(opts.output)
    : defaultOutputPath(inputPath);

  const source = await Bun.file(inputPath).text();
  const { lua, diagnostics } = await transpile(source, {
    macroModules: opts.macroModules,
    sourcePath: inputPath,
  });

  await Bun.write(outputPath, lua);
  return { inputPath, outputPath, lua, diagnostics };
}

/** `foo/bar/baz.neoc` -> `foo/bar/baz.lua`. */
function defaultOutputPath(input: string): string {
  if (input.endsWith(".neoc")) return `${input.slice(0, -5)}.lua`;
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  return path.join(dir, `${base}.lua`);
}

/**
 * Multi-file compile + optional watch. Walks every `.neoc` matching
 * `sourceGlobs`, compiles each, optionally re-runs on file change.
 */
export interface BuildOptions {
  sourceGlobs: string[];
  cwd: string;
  macroModules?: string[];
  watch?: boolean;
  log?: (msg: string) => void;
}

export async function buildProject(opts: BuildOptions): Promise<string[]> {
  const log = opts.log ?? ((m) => console.log(m));
  const files = await collectNeocFiles(opts.sourceGlobs, opts.cwd);
  const written: string[] = [];

  const compileOne = async (file: string): Promise<void> => {
    try {
      const result = await compileFile({
        input: file,
        macroModules: opts.macroModules,
      });
      for (const d of result.diagnostics) {
        log(`neoc: ${path.relative(opts.cwd, file)}: ${d.message} (${d.span.start}..${d.span.end})`);
      }
      written.push(result.outputPath);
      log(`wrote ${path.relative(opts.cwd, result.outputPath) || result.outputPath}`);
    } catch (err) {
      log(`neoc: ${path.relative(opts.cwd, file)}: ${err instanceof Error ? err.message : String(err)}`);
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
        if (!filename.endsWith(".neoc")) return;
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

async function collectNeocFiles(globs: string[], cwd: string): Promise<string[]> {
  const out = new Set<string>();
  for (const g of globs) {
    const glob = new Bun.Glob(g);
    for await (const match of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
      if (match.endsWith(".neoc")) out.add(match);
    }
  }
  return [...out].sort();
}
