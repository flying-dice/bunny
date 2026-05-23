export type { RunCliOptions } from "./cli.ts";
export { runCli } from "./cli.ts";

// Tsb compiler surface — programmatic access for tools that want to
// transpile or assemble outside the CLI.
export type { TranspileOptions, TranspileResult } from "./neoc/compiler.ts";
export { transpile } from "./neoc/compiler.ts";
export type { BuildOptions, CompileOptions, CompileResult } from "./neoc/driver.ts";
export { buildProject, compileFile } from "./neoc/driver.ts";
export type { Macro, MacroContext } from "./neoc/macros/registry.ts";
export { MacroRegistry } from "./neoc/macros/registry.ts";
