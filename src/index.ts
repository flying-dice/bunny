export type { RunCliOptions } from "./cli.ts";
export { runCli } from "./cli.ts";

// Tsb compiler surface — programmatic access for tools that want to
// transpile or assemble outside the CLI.
export type { TranspileOptions, TranspileResult } from "./tsb/compiler.ts";
export { transpile } from "./tsb/compiler.ts";
export type { BuildOptions, CompileOptions, CompileResult } from "./tsb/driver.ts";
export { buildProject, compileFile } from "./tsb/driver.ts";
export type { Macro, MacroContext } from "./tsb/macros/registry.ts";
export { MacroRegistry } from "./tsb/macros/registry.ts";
