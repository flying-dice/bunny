/**
 * Public type-only API for authoring neoc macros. Import from
 * `@flying-dice/neoc-compiler/macro`:
 *
 *   import type { DeriveMacro, StructDecl, MacroContext } from "@flying-dice/neoc-compiler/macro";
 *
 * Re-exports the model + macro types from src/neoc. Type-only so the
 * macro author's file has zero runtime dependency on neoc — the
 * compiler resolves the import at codegen and erases it.
 */
export type {
  Attr,
  FunctionDecl,
  ImplDecl,
  ImplMethod,
  Module,
  ModulePart,
  OpaqueText,
  ParseDiagnostic,
  Span,
  StructDecl,
  StructField,
} from "../ast/index.ts";

export type {
  DeriveMacro,
  DeriveOpts,
  FieldConstraintMacro,
  FieldConstraintOpts,
  FunctionAttrMacro,
  FunctionAttrOpts,
  FunctionAttrResult,
  Macro,
  MacroContext,
} from "./registry.ts";
