/**
 * Top-level tsb compile. parse → run macros via the emitter → final TS.
 *
 *   const { ts, diagnostics } = transpile(source);
 */
import { registerBuiltins } from "./builtin-macros.ts";
import { emit, type EmitChunk } from "./emitter.ts";
import { MacroRegistry } from "./macros.ts";
import * as M from "./model.ts";
import { parse } from "./parser.ts";

export interface TranspileOptions {
  /**
   * Paths to user-authored macro modules to load (absolute or
   * dynamically importable). Each module's `default` export — a `Macro`
   * or `Macro[]` — gets registered alongside the built-ins.
   */
  macroModules?: string[];
  /**
   * Absolute path of the source file. Forwarded to macros so they can
   * resolve sibling resources (e.g. the `#[sql]` macro reads
   * `./sql/{name}.sql` relative to this path).
   */
  sourcePath?: string;
}

export interface TranspileResult {
  ts: string;
  diagnostics: M.ParseDiagnostic[];
  chunks: EmitChunk[];
}

export async function transpile(
  source: string,
  options: TranspileOptions = {}
): Promise<TranspileResult> {
  const { module, diagnostics: parseDiags } = parse(source);
  const registry = new MacroRegistry();
  registerBuiltins(registry);
  for (const path of options.macroModules ?? []) {
    await registry.loadFrom(path);
  }
  const { ts, diagnostics: emitDiags, chunks } = emit(module, registry, {
    sourcePath: options.sourcePath,
  });
  return { ts, diagnostics: [...parseDiags, ...emitDiags], chunks };
}
