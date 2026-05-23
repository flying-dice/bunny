/**
 * Macro registry + execution. The new tsb compiler runs every registered
 * macro against the parsed module before emit. Macros transform the model
 * in place: they may add methods to impls, prepend statements to method
 * bodies, wrap function bodies, register module-level state, and so on.
 *
 * Built-in macros (Clone, Equals, route verbs, field constraints, …) and
 * user-authored macros use the same API.
 */

import * as M from "./model.ts";

export interface MacroContext {
  module: M.Module;
  /**
   * Absolute path of the source `.tsb` file being compiled. Undefined
   * when transpile is called against an in-memory string (e.g. from the
   * LSP didChange path). Macros that resolve sibling resources (SQL
   * files, fixtures, …) should fall back gracefully when this is unset.
   */
  sourcePath?: string;
  /** Push a compile-time diagnostic. */
  error(message: string, span: M.Span): void;
  /**
   * Register a snippet to be appended to the module's emitted output. Used
   * by macros that need to emit code at module scope (e.g. a route macro
   * registering an entry in a project-wide table).
   */
  appendModule(text: string): void;
  /**
   * Accumulate an entry into a named record that the emitter outputs as
   * a single `export const <recordName> = { ... };` at module end.
   *
   * `mode` controls multi-write semantics:
   *  - `"object"` (default): values are object-literal fragments. Two
   *    writes to the same outer key merge via shallow spread, so two
   *    routes on the same path with different methods land as one
   *    `{ GET: …, POST: … }` entry.
   *  - `"array"`: values append into an array under the outer key —
   *    used for listener handlers where many subscribers can share an
   *    event name.
   */
  appendToRecord(
    recordName: string,
    entryKey: string,
    entryValue: string,
    mode?: "object" | "array"
  ): void;
}

export interface MacroOutputContext extends MacroContext {
  /** Diagnostics collected during macro execution. */
  readonly diagnostics: readonly M.ParseDiagnostic[];
  /** Module-level text the macros want appended after the emit. */
  readonly moduleAppend: string;
}

/**
 * A macro that runs over a specific struct field — typically a validation
 * constraint like `minLength`. The macro returns one or more statements
 * to inject at the start of the matching impl's `new` method body.
 */
export interface FieldConstraintMacro {
  kind: "field-constraint";
  /** Matches `#[name(...)]` on a struct field. */
  name: string;
  /**
   * Return guard statements (with trailing semicolons / newlines). The
   * runtime expression `data.<fieldName>` references the property; raise
   * via `throw new Error(...)`.
   */
  emit(ctx: MacroContext, opts: FieldConstraintOpts): string[];
}

export interface FieldConstraintOpts {
  struct: M.StructDecl;
  field: M.StructField;
  attr: M.Attr;
}

/**
 * A macro that derives an additional method on an impl block. Triggered
 * by `#[derive(Name)]` on the struct (the derive args list).
 */
export interface DeriveMacro {
  kind: "derive";
  /** Matches a name listed in `#[derive(...)]` (case-sensitive). */
  name: string;
  /**
   * Return the method source to add to the impl. The string should look
   * like a normal TS object-method, e.g. `clone(self: Foo): Foo { return { ...self }; }`.
   * The emitter handles the surrounding comma + indentation.
   */
  emit(ctx: MacroContext, opts: DeriveOpts): string;
}

export interface DeriveOpts {
  struct: M.StructDecl;
  impl: M.ImplDecl | undefined;
}

/**
 * A macro that wraps a function declaration. Triggered by an attribute on
 * the function (typically a verb tag like `get` / `post`).
 */
export interface FunctionAttrMacro {
  kind: "function-attr";
  name: string;
  emit(ctx: MacroContext, opts: FunctionAttrOpts): FunctionAttrResult;
}

export interface FunctionAttrOpts {
  fn: M.FunctionDecl;
  attr: M.Attr;
}

export interface FunctionAttrResult {
  /**
   * Replacement source for the entire function declaration. If multiple
   * macros want to wrap the same function, they compose in source order:
   * later macros see the prior macro's output as `fn.body` (re-parsed).
   * Empty string means "keep the original".
   */
  replacement: string;
}

export type Macro = FieldConstraintMacro | DeriveMacro | FunctionAttrMacro;

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

export class MacroRegistry {
  private fieldConstraints = new Map<string, FieldConstraintMacro>();
  private derives = new Map<string, DeriveMacro>();
  private functionAttrs = new Map<string, FunctionAttrMacro>();

  register(macro: Macro): void {
    if (macro.kind === "field-constraint") this.fieldConstraints.set(macro.name, macro);
    else if (macro.kind === "derive") this.derives.set(macro.name, macro);
    else if (macro.kind === "function-attr") this.functionAttrs.set(macro.name, macro);
  }

  /**
   * Dynamically import a user-authored macro module and register every
   * macro it exports. The module's `default` export may be a single
   * `Macro` or an array. A named `macros` export (array) is also
   * supported as a fallback.
   */
  async loadFrom(modulePath: string): Promise<void> {
    const mod = (await import(modulePath)) as {
      default?: Macro | Macro[];
      macros?: Macro[];
    };
    const candidates: Macro[] = [];
    if (Array.isArray(mod.default)) candidates.push(...mod.default);
    else if (mod.default !== undefined) candidates.push(mod.default);
    if (Array.isArray(mod.macros)) candidates.push(...mod.macros);
    for (const m of candidates) this.register(m);
  }

  fieldConstraint(name: string): FieldConstraintMacro | undefined {
    return this.fieldConstraints.get(name);
  }

  derive(name: string): DeriveMacro | undefined {
    return this.derives.get(name);
  }

  functionAttr(name: string): FunctionAttrMacro | undefined {
    return this.functionAttrs.get(name);
  }
}
