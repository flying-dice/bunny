/**
 * neoc parser — source text → AST.
 *
 * Standalone module: depends on `../ast` for types. The same AST
 * drives the TypeScript codegen, the LSP, and any future codegen
 * target. Backed by the tree-sitter grammar at
 * `zed/tree-sitter-neoc/`; the WASM is loaded once at startup.
 */
export { parseToAst } from "./tree-sitter.ts";
export { parseViaTreeSitter as parse } from "./adapter.ts";
