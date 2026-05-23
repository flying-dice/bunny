export type { RunCliOptions } from "./cli.ts";
export { runCli } from "./cli.ts";

// Tsb compiler surface — programmatic access for tools that want to
// transpile or assemble outside the CLI.
export type { TranspileOptions, TranspileResult } from "./tsb/transpile.ts";
export { transpile } from "./tsb/transpile.ts";
export type { BuildOptions, CompileOptions, CompileResult } from "./tsb/compile.ts";
export { buildProject, compileFile } from "./tsb/compile.ts";
export type { Macro, MacroContext } from "./tsb/macros.ts";
export { MacroRegistry } from "./tsb/macros.ts";
