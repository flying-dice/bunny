/**
 * One-shot transpile entry point. Reads a `.tsb` file, runs the rewriter,
 * writes the resulting TypeScript to disk (alongside the source by default,
 * or to a user-specified path).
 *
 * When the compiled output uses `Result` / `Ok` / `Err`, a single shared
 * `bunny.d.ts` (ambient types + function signatures) and
 * `bunny.runtime.ts` (the runtime that installs the functions on
 * `globalThis`) are written once per build at the build root. Each
 * compiled `.ts` gets a side-effect `import` to the runtime so the
 * globals exist when the module loads. Avoids per-file prelude
 * injection.
 */
import * as path from "node:path";
import { appendSourceMappingURL, generateSourceMap } from "./codegen/sourcemap.ts";
import { transpile } from "./compiler.ts";

export interface CompileOptions {
  /** Path to the input `.tsb` file (absolute or cwd-relative). */
  input: string;
  /** Optional output path. Defaults to the input with `.tsb` swapped for `.ts`. */
  output?: string;
  /** Absolute or dynamically importable paths for user-authored macros. */
  macroModules?: string[];
  /**
   * Directory to write the shared `bunny.d.ts` + `bunny.runtime.ts`
   * artefacts when the compiled output uses `Result`. Defaults to the
   * input file's directory.
   */
  buildRoot?: string;
}

export interface CompileResult {
  inputPath: string;
  outputPath: string;
  ts: string;
  diagnostics: { message: string; span: { start: number; end: number } }[];
  /** True if the bunny runtime artefacts were referenced. */
  usesResult: boolean;
}

export async function compileFile(opts: CompileOptions): Promise<CompileResult> {
  const inputPath = path.resolve(opts.input);
  const outputPath = opts.output
    ? path.resolve(opts.output)
    : defaultOutputPath(inputPath);
  const buildRoot = opts.buildRoot
    ? path.resolve(opts.buildRoot)
    : path.dirname(inputPath);

  const source = await Bun.file(inputPath).text();
  const { ts, diagnostics, chunks, usesResult } = await transpile(source, {
    macroModules: opts.macroModules,
    sourcePath: inputPath,
  });

  // Side-effect import that loads the bunny runtime (installs globalThis
  // helpers). Computed relative to the compiled file's directory.
  const tsWithImport = usesResult
    ? prependRuntimeImport(ts, outputPath, buildRoot)
    : ts;

  const mapPath = `${outputPath}.map`;
  const mapBasename = path.basename(mapPath);
  const tsWithRef = appendSourceMappingURL(tsWithImport, mapBasename);
  const sourceMap = generateSourceMap(
    path.basename(outputPath),
    path.basename(inputPath),
    source,
    chunks
  );
  await Bun.write(outputPath, tsWithRef);
  await Bun.write(mapPath, JSON.stringify(sourceMap));

  if (usesResult) await writeBunnyArtefacts(buildRoot);

  return { inputPath, outputPath, ts: tsWithRef, diagnostics, usesResult };
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
  let anyUsesResult = false;

  const compileOne = async (file: string): Promise<void> => {
    try {
      const result = await compileFile({
        input: file,
        macroModules: opts.macroModules,
        buildRoot: opts.cwd,
      });
      if (result.usesResult) anyUsesResult = true;
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

  if (anyUsesResult) {
    await writeBunnyArtefacts(opts.cwd);
    written.push(path.join(opts.cwd, "bunny.d.ts"));
    written.push(path.join(opts.cwd, "bunny.runtime.ts"));
  }

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

/**
 * Compute the relative path from the compiled `.ts`'s directory to
 * `bunny.runtime.ts` at the build root, and prepend a side-effect
 * import. The import installs the runtime globals before the rest of
 * the module body runs.
 */
function prependRuntimeImport(
  ts: string,
  outputPath: string,
  buildRoot: string
): string {
  const rel = path.relative(path.dirname(outputPath), buildRoot);
  const normalised = rel === "" ? "." : rel.startsWith(".") ? rel : `./${rel}`;
  const importPath = `${normalised.replace(/\\/g, "/")}/bunny.runtime.ts`;
  return `import ${JSON.stringify(importPath)};\n${ts}`;
}

/**
 * Write the shared `bunny.d.ts` + `bunny.runtime.ts` artefacts at the
 * build root. `bunny.d.ts` declares ambient types + function
 * signatures so compiled `.ts` files don't need explicit imports;
 * `bunny.runtime.ts` installs the runtime on `globalThis` when its
 * side-effect import runs.
 */
async function writeBunnyArtefacts(buildRoot: string): Promise<void> {
  await Bun.write(path.join(buildRoot, "bunny.d.ts"), BUNNY_DTS);
  await Bun.write(path.join(buildRoot, "bunny.runtime.ts"), BUNNY_RUNTIME);
}

const BUNNY_DTS = `// AUTO-GENERATED by bunny. Provides ambient types and function
// signatures referenced by compiled .ts files. The matching runtime
// lives in \`bunny.runtime.ts\` and is loaded via a side-effect import
// at the top of every compiled module that uses Result.
declare global {
  type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
  type ConstraintError = { field: string; message: string };
  function Ok<T>(value: T): Result<T, never>;
  function Err<E>(error: E): Result<never, E>;
  function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T };
  function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E };
  function unwrap<T, E>(r: Result<T, E>): T;
  function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T;
  function mapResult<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E>;
  function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F>;
  function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;
}
export {};
`;

const BUNNY_RUNTIME = `// AUTO-GENERATED by bunny. Installs the runtime globals declared in
// \`bunny.d.ts\`. Compiled .ts files load this via a side-effect import
// at the top of each module so the globals exist before user code
// runs. Idempotent — re-imports are no-ops.
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const g = globalThis as Record<string, unknown>;
if (typeof g.Ok !== "function") {
  g.Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
  g.Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
  g.isOk = <T, E>(r: Result<T, E>): boolean => r.ok;
  g.isErr = <T, E>(r: Result<T, E>): boolean => !r.ok;
  g.unwrap = <T, E>(r: Result<T, E>): T => {
    if (r.ok) return r.value;
    throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error));
  };
  g.unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);
  g.mapResult = <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    r.ok ? { ok: true, value: fn(r.value) } : r;
  g.mapErr = <T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
    r.ok ? r : { ok: false, error: fn(r.error) };
  g.andThen = <T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> =>
    r.ok ? fn(r.value) : r;
}

export {};
`;
