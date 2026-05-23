/**
 * One-shot transpile entry point. Reads a `.neoc` file, runs the
 * rewriter, writes the resulting Lua to disk (alongside the source by
 * default, or to a user-specified path).
 */
import * as path from "node:path";
import * as os from "node:os";
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

/**
 * Compile every `.neoc` matching `sourceGlobs`, then execute each
 * compiled `.lua` under `luau` (or `lua`) with a driver appended that
 * runs every registration in `__neoc_tests`. Reports a pass/fail count.
 */
export interface RunTestsOptions {
  sourceGlobs: string[];
  cwd: string;
  macroModules?: string[];
  log?: (msg: string) => void;
}

export interface RunTestsResult {
  passed: number;
  failed: number;
}

export async function runTests(opts: RunTestsOptions): Promise<RunTestsResult> {
  const log = opts.log ?? ((m) => console.log(m));
  const runner = Bun.which("luau") ?? Bun.which("lua");
  if (!runner) {
    log(`neoc: no Lua runtime found. Install luau via \`brew install luau\`.`);
    return { passed: 0, failed: 0 };
  }

  const files = await collectNeocFiles(opts.sourceGlobs, opts.cwd);
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const result = await compileFile({
        input: file,
        macroModules: opts.macroModules,
      });
      for (const d of result.diagnostics) {
        log(`neoc: ${path.relative(opts.cwd, file)}: ${d.message} (${d.span.start}..${d.span.end})`);
      }

      const driverSource = `${result.lua}\n${TEST_DRIVER}\n`;
      const tmpPath = path.join(
        os.tmpdir(),
        `neoc-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.lua`
      );
      await Bun.write(tmpPath, driverSource);
      const proc = Bun.spawn({
        cmd: [runner, tmpPath],
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;

      const rel = path.relative(opts.cwd, file) || file;
      const lines = stdout.split("\n").filter((l) => l.length > 0);
      for (const line of lines) {
        if (line.startsWith("PASS ")) {
          passed++;
          log(`${rel}: ${line}`);
        } else if (line.startsWith("FAIL ")) {
          failed++;
          log(`${rel}: ${line}`);
        } else {
          log(`${rel}: ${line}`);
        }
      }
      if (stderr.length > 0) {
        log(`${rel}: ${stderr.trim()}`);
      }
    } catch (err) {
      failed++;
      log(`neoc: ${path.relative(opts.cwd, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(`${passed} passed, ${failed} failed`);
  return { passed, failed };
}

const TEST_DRIVER = `
__neoc_tests = __neoc_tests or {}
for _, t in ipairs(__neoc_tests) do
  local ok, err = pcall(t.run)
  if ok then
    print("PASS " .. t.name)
  else
    print("FAIL " .. t.name .. ": " .. tostring(err))
  end
end
`;
