/**
 * Top-level neoc compile. parse → run macros via the emitter → final Lua.
 *
 *   const { lua, diagnostics } = await transpile(source);
 */
import { registerBuiltins } from "./macros/builtins.ts";
import { emit, type EmitChunk } from "./codegen/lua/index.ts";
import { MacroRegistry } from "./macros/registry.ts";
import * as M from "./ast/index.ts";
import { parseViaTreeSitter } from "./parser/adapter.ts";

export interface TranspileOptions {
  macroModules?: string[];
  sourcePath?: string;
}

export interface TranspileResult {
  lua: string;
  diagnostics: M.ParseDiagnostic[];
  chunks: EmitChunk[];
  usesResult: boolean;
}

export async function transpile(
  source: string,
  options: TranspileOptions = {}
): Promise<TranspileResult> {
  const { module, diagnostics: parseDiags } = await parseViaTreeSitter(source);
  const registry = new MacroRegistry();
  registerBuiltins(registry);
  for (const path of options.macroModules ?? []) {
    await registry.loadFrom(path);
  }
  const { lua, diagnostics: emitDiags, chunks, usesResult } = emit(module, registry, {
    sourcePath: options.sourcePath,
  });
  return {
    lua,
    diagnostics: [...parseDiags, ...emitDiags],
    chunks,
    usesResult,
  };
}
