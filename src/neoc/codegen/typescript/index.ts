/**
 * TypeScript codegen — AST → `.ts` source.
 *
 * One concrete implementation of "given a neoc AST, emit a target
 * language". A future Go / Rust codegen lives as a sibling under
 * `../go/`, `../rust/` etc. and consumes the same AST shape.
 *
 * Today the AST carries method/function bodies as opaque text, which
 * works for TypeScript (the body is already valid TS, just needs
 * match lowering + macro injection). Cross-language codegens will
 * require richer expression/statement AST nodes — see the migration
 * note in `../../ast/index.ts`.
 *
 *
 * Order of operations per module:
 *
 *   1. Walk every part. For each `OpaqueText`, push verbatim.
 *   2. For each `StructDecl`, render `type Foo = {…};` with attrs stripped.
 *   3. For each `ImplDecl`, render `const Foo = {…};` where each method's
 *      body is potentially augmented by field-constraint macros, plus
 *      `#[derive(…)]` macros append new methods.
 *   4. For each `FunctionDecl`, run function-attr macros (in source order)
 *      to wrap / rewrite. If none apply, emit the function verbatim.
 *
 * Macros never modify input text directly — they return text snippets the
 * emitter weaves into the right slot.
 */

import * as M from "../../ast/index.ts";
import { type MacroContext, MacroRegistry } from "../../macros/registry.ts";

export interface EmitChunk {
  text: string;
  /**
   * Byte offset into the original `.neoc` source this chunk came from.
   * Undefined for chunks the emitter introduced from thin air (synthetic
   * impls, dispatcher scaffolding, macro `appendModule` calls).
   */
  sourceOffset?: number;
}

export interface EmitResult {
  ts: string;
  diagnostics: M.ParseDiagnostic[];
  /**
   * Ordered list of (text, sourceOffset) chunks whose concatenation
   * equals `ts`. The source map generator walks these to assign each
   * emitted line back to its `.neoc` origin.
   */
  chunks: EmitChunk[];
  /**
   * True when the emitted code references the `Result` / `Ok` / `Err`
   * / `ConstraintError` runtime. The driver (compile / buildProject)
   * uses this signal to write a single shared `neoc.d.ts` +
   * `neoc.runtime.ts` per build instead of injecting the prelude
   * into every file.
   */
  usesResult: boolean;
}

export interface EmitOptions {
  sourcePath?: string;
}

export function emit(
  module: M.Module,
  registry: MacroRegistry,
  options: EmitOptions = {}
): EmitResult {
  const diagnostics: M.ParseDiagnostic[] = [];
  const chunks: EmitChunk[] = [];
  const push = (text: string, sourceOffset?: number): void => {
    if (text.length === 0) return;
    chunks.push({ text, sourceOffset });
  };
  let moduleAppend = "";
  // Flips to true the first time the emitter synthesises code that
  // references `Result` / `Ok` / `Err` / `ConstraintError`. When set, the
  // module gets a self-contained prelude defining those types and
  // helpers — no runtime dependency on neoc.
  const state = { usesResult: false };
  // Records collected by macros via `ctx.appendToRecord`. Emitted as
  // `export const <name> = { ... }` after every part has been processed.
  const records = new Map<
    string,
    { mode: "object" | "array"; entries: Map<string, string[]> }
  >();
  const ctx = {
    module,
    sourcePath: options.sourcePath,
    error(message: string, span: M.Span): void {
      diagnostics.push({ message, span });
    },
    appendModule(text: string): void {
      moduleAppend += (moduleAppend.length > 0 ? "\n" : "") + text;
    },
    appendToRecord(
      recordName: string,
      key: string,
      value: string,
      mode: "object" | "array" = "object"
    ): void {
      let rec = records.get(recordName);
      if (!rec) {
        rec = { mode, entries: new Map() };
        records.set(recordName, rec);
      }
      const arr = rec.entries.get(key) ?? [];
      arr.push(value);
      rec.entries.set(key, arr);
    },
  };

  // Build a name → struct lookup so derive macros can read fields when
  // expanding inside the matching impl.
  const structByName = new Map<string, M.StructDecl>();
  const traitByName = new Map<string, M.TraitDecl>();
  for (const p of module.parts) {
    if (p.kind === "struct") structByName.set(p.name, p);
    else if (p.kind === "trait") traitByName.set(p.name, p);
  }

  // Group trait-impls by their target struct so they fold into the
  // target's const block. A trait impl's methods are appended after the
  // inherent impl's methods (and after derive-generated ones), giving
  // the impl block its full method surface in source order.
  const traitImplsByTarget = new Map<string, M.ImplDecl[]>();
  const inherentImplTargets = new Set<string>();
  for (const p of module.parts) {
    if (p.kind !== "impl") continue;
    if (p.traitName) {
      const arr = traitImplsByTarget.get(p.name) ?? [];
      arr.push(p);
      traitImplsByTarget.set(p.name, arr);
    } else {
      inherentImplTargets.add(p.name);
    }
  }

  // For each struct that has derives, trait impls, or field constraints
  // but NO inherent impl, synthesise a minimal
  // `impl Foo { new(data: Foo): Foo { return data; } }` so the derived
  // / trait methods have a const block to land in — and so field
  // constraints have a `new` to inject their guards into.
  // Every struct gets an inherent impl — at minimum, the synthesised
  // `new(data)` factory that injects the `_struct` brand. User-written
  // impl blocks take precedence; if one already exists we leave it
  // alone (and the user is responsible for setting `_struct` if they
  // want branding to apply to their hand-rolled constructor).
  const syntheticImpls = new Map<string, M.ImplDecl>();
  for (const p of module.parts) {
    if (p.kind !== "struct") continue;
    if (inherentImplTargets.has(p.name)) continue;
    syntheticImpls.set(p.name, synthesiseInherentImpl(p));
  }

  for (const part of module.parts) {
    switch (part.kind) {
      case "opaque":
        // Match is a language feature, not an attribute-driven
        // transform — lower it inside arbitrary user code (free
        // functions, top-level statements) as well as in
        // neoc-parsed declarations.
        push(part.text, part.span.start);
        break;
      case "struct": {
        push(emitStruct(part), part.span.start);
        const synth = syntheticImpls.get(part.name);
        if (synth) {
          push("\n", part.span.start);
          push(
            emitImpl(synth, part, traitImplsByTarget.get(part.name) ?? [], registry, ctx, traitByName, state),
            part.span.start
          );
        }
        break;
      }
      case "impl":
        if (part.traitName) break;
        push(
          emitImpl(part, structByName.get(part.name), traitImplsByTarget.get(part.name) ?? [], registry, ctx, traitByName, state),
          part.span.start
        );
        break;
      case "trait":
        push(emitTrait(part), part.span.start);
        break;
      case "function":
        push(emitFunction(part, registry, ctx), part.span.start);
        break;
    }
  }

  if (moduleAppend.length > 0) {
    push("\n");
    push(moduleAppend);
    push("\n");
  }

  // Emit each accumulated record as a top-level const.
  for (const [name, rec] of records) {
    const entries: string[] = [];
    for (const [key, values] of rec.entries) {
      if (rec.mode === "array") {
        entries.push(`  ${key}: [${values.join(", ")}]`);
      } else if (values.length === 1) {
        entries.push(`  ${key}: ${values[0]}`);
      } else {
        // Same outer key written multiple times → shallow object merge.
        entries.push(`  ${key}: { ${values.map((v) => `...${v}`).join(", ")} }`);
      }
    }
    push(`\nexport const ${name} = {\n${entries.join(",\n")},\n};\n`);
  }

  const ts = chunks.map((c) => c.text).join("");
  return { ts, diagnostics, chunks, usesResult: state.usesResult };
}

// ----------------------------------------------------------------------------
// struct → type
// ----------------------------------------------------------------------------

/**
 * Emit a `trait Name<G> { … }` as a generic TS interface. The first
 * generic parameter is always `Self` (the implementing type) so the
 * `self: Self` receiver typechecks. User-declared generics follow.
 *
 * Method bodies (default implementations) live on the impl side — the
 * interface only carries signatures.
 */
function emitTrait(t: M.TraitDecl): string {
  const generics = t.generics.trim();
  const inner = generics.length === 0 ? "Self" : `Self, ${generics.replace(/^<|>$/g, "")}`;
  const lines: string[] = [];
  lines.push(`export interface ${t.name}<${inner}> {`);
  for (const m of t.methods) {
    const async = m.isAsync ? "async " : "";
    // Keep Self verbatim — the user's `self: Self` already references it.
    const sig = m.signature.trim();
    lines.push(`  ${async}${m.name}${sig};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function emitStruct(s: M.StructDecl): string {
  // structs always export their type — same convention as `impl`. The
  // value identity (a struct = a publicly addressable data shape) only
  // makes sense if other modules can name it.
  //
  // Every struct's type carries a hidden `_struct: "<Name>"` brand so
  // that values from different structs are statically distinguishable
  // in a union (`type CalcError = BadNumber | DivByZero;`) and match
  // arms can dispatch by struct name. The brand is populated by
  // `<Name>.new(…)` and `<Name>.tryNew(…)`; users don't write it
  // themselves.
  void s.exported;
  const lines: string[] = [];
  lines.push(`export type ${s.name}${s.generics} = {`);
  // Optional so raw `{ field: value }` literals (e.g. nested-struct
  // field values passed into a parent's `tryNew`) still typecheck —
  // the brand is added when the value flows through `<Name>.new` or
  // `<Name>.tryNew`. Match arms check for the brand's *presence* to
  // confirm the value really is a constructed Name instance.
  lines.push(`  readonly _struct?: ${JSON.stringify(s.name)};`);
  for (const f of s.fields) {
    const opt = f.optional ? "?" : "";
    lines.push(`  ${f.name}${opt}: ${f.type};`);
  }
  lines.push("};");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// impl → const
// ----------------------------------------------------------------------------

function emitImpl(
  impl: M.ImplDecl,
  struct: M.StructDecl | undefined,
  traitImpls: readonly M.ImplDecl[],
  registry: MacroRegistry,
  ctx: MacroContext,
  traitByName: ReadonlyMap<string, M.TraitDecl>,
  state: { usesResult: boolean }
): string {
  // impl blocks are always exported — the whole point is to expose the
  // struct's methods to importers. Module-private impls don't carry their
  // weight in the syntax surface.
  const prefix = "export ";
  void impl.exported;

  // Method-body augmentations from field-constraint macros: when a field
  // on the matching struct carries `#[minLength(1)]` (etc.), the macro
  // emits guard statements that get prepended to the impl's `new` method.
  const guardLines = struct ? collectGuards(struct, registry, ctx) : [];

  // Derive macros: `#[derive(Clone, Equals)]` on the struct appends one
  // method per derived trait into the impl.
  const derivedMethods: string[] = struct ? collectDerives(struct, impl, registry, ctx) : [];

  const methodTexts: string[] = [];
  for (const m of impl.methods) {
    methodTexts.push(renderMethod(m, m.name === "new" ? guardLines : []));
  }
  // `tryNew(data) -> Result<Foo, ConstraintError>` — same guards as `new`,
  // but each violation returns `Err(...)` instead of throwing. Only
  // emitted when the struct actually has constraint guards, so structs
  // without validation don't gain a redundant tryNew.
  if (guardLines.length > 0 && impl.methods.some((m) => m.name === "new")) {
    state.usesResult = true;
    methodTexts.push(renderTryNew(impl.name, guardLines));
  }
  for (const d of derivedMethods) {
    // Empty string means the derive only side-effected (e.g. an Event
    // derive that only registers a module-level const). Skip the
    // empty so we don't emit a stray `,` inside the const block.
    if (d.trim().length > 0) methodTexts.push(d);
  }
  // Trait impls (`impl From<T> for Foo`, etc.) — their methods land on
  // the target's const, after the inherent + derived methods.
  //
  // When multiple `impl From<T> for Foo` blocks all name their method
  // `from`, we generate a single overloaded `from()` with typeof-based
  // runtime discrimination instead of letting the duplicate-key
  // collision land. The user's bodies move to `__from_<typeKey>`
  // helpers and the synthetic `from` dispatches.
  const fromImpls = traitImpls.filter(
    (t) => t.traitName === "From" && t.methods.some((m) => m.name === "from")
  );
  const otherTraitImpls = traitImpls.filter((t) => !fromImpls.includes(t));

  if (fromImpls.length >= 2) {
    const dispatch = renderFromDispatcher(impl.name, fromImpls);
    for (const helper of dispatch.helpers) methodTexts.push(helper);
    methodTexts.push(dispatch.dispatcher);
  } else {
    for (const t of fromImpls) {
      for (const m of t.methods) methodTexts.push(renderMethod(m, []));
    }
  }
  for (const t of otherTraitImpls) {
    for (const m of t.methods) methodTexts.push(renderMethod(m, []));
  }

  // Fill in default methods from the trait declaration for any methods
  // the impl didn't supply. Same-module traits only — cross-module
  // defaults can't be resolved without a module-graph pass.
  const satisfiesParts: string[] = [];
  for (const t of traitImpls) {
    if (!t.traitName) continue;
    const trait = traitByName.get(t.traitName);
    if (trait) {
      const providedNames = new Set(t.methods.map((m) => m.name));
      for (const tm of trait.methods) {
        if (providedNames.has(tm.name)) continue;
        if (tm.body === undefined) continue; // required method not provided
        methodTexts.push(renderTraitDefault(tm, impl.name));
      }
    }
    // Build the `satisfies <Trait>[<Args>]` suffix segment. The
    // trait's interface is generic in `Self` so we always supply the
    // target name as the first generic arg; any user-supplied
    // `<string>` etc. follow.
    const userArgs = (t.traitArgs ?? "").trim().replace(/^<|>$/g, "").trim();
    const args = userArgs.length > 0 ? `${impl.name}, ${userArgs}` : impl.name;
    satisfiesParts.push(`${t.traitName}<${args}>`);
  }

  const lines: string[] = [];
  lines.push(`${prefix}const ${impl.name} = {`);
  for (let i = 0; i < methodTexts.length; i++) {
    const text = methodTexts[i]!;
    const indented = text
      .split("\n")
      .map((l) => (l.length > 0 ? `  ${l}` : l))
      .join("\n");
    lines.push(`${indented},`);
    if (i < methodTexts.length - 1) lines.push("");
  }
  lines.push("};");
  // Compile-time trait conformance: assign the const into the trait
  // type. Unlike `satisfies` on an object literal, a const-to-const
  // assignment skips excess-property checking, so extra methods (like
  // `new`) don't fail — but missing or mistyped trait methods still
  // surface as TS errors.
  for (let s = 0; s < satisfiesParts.length; s++) {
    lines.push(
      `const __${impl.name}_satisfies_${s}: ${satisfiesParts[s]!} = ${impl.name}; void __${impl.name}_satisfies_${s};`
    );
  }
  return lines.join("\n");
}

/**
 * Inline a trait's default method onto the target's const, substituting
 * `Self` with the concrete type name throughout the signature + body.
 */
function renderTraitDefault(m: M.TraitMethod, targetName: string): string {
  const async = m.isAsync ? "async " : "";
  const signature = m.signature.replace(/\bSelf\b/g, targetName);
  const body = (m.body ?? "").replace(/\bSelf\b/g, targetName);
  return `${async}${m.name}${signature} ${body}`;
}

/**
 * Build a Result-returning constructor that mirrors `new(data)` but
 * surfaces every constraint failure as `Err(ConstraintError)` instead
 * of throwing. The throwing-form guards are rewritten line-by-line:
 *
 *   if (cond) throw new Error("name must be ...");
 *   →
 *   if (cond) return Err({ field: "name", message: "name must be ..." });
 *
 * The convention every built-in constraint macro follows is that the
 * error message starts with the field name, which we use as the
 * `ConstraintError.field` value.
 */
function renderTryNew(target: string, throwingGuards: readonly string[]): string {
  const lines: string[] = [];
  for (const g of throwingGuards) {
    // Pattern 1 — throwing constraint:
    //   if (<cond>) throw new Error("name must be ...");
    const guardMatch = g.match(/^if \((.*)\) throw new Error\("([^ ]+)([^"]*)"\);$/);
    if (guardMatch) {
      const [, cond, field, rest] = guardMatch;
      const message = `${field}${rest}`;
      lines.push(
        `if (${cond}) return Err({ field: ${JSON.stringify(field)}, message: ${JSON.stringify(message)} });`
      );
      continue;
    }
    // Pattern 2 — deep validation (mandatory field):
    //   data.<f> = <T>.new(data.<f>);
    const deepMatch = g.match(/^data\.(\w+) = (\w+)\.new\(data\.\1\);$/);
    if (deepMatch) {
      const [, field, type] = deepMatch;
      const v = `__r_${field}`;
      lines.push(`const ${v} = ${type}.tryNew(data.${field});`);
      lines.push(`if (!${v}.ok) return ${v};`);
      lines.push(`data.${field} = ${v}.value;`);
      continue;
    }
    // Pattern 3 — deep validation (optional field):
    //   if (data.<f> !== undefined) data.<f> = <T>.new(data.<f>);
    const deepOptMatch = g.match(
      /^if \(data\.(\w+) !== undefined\) data\.\1 = (\w+)\.new\(data\.\1\);$/
    );
    if (deepOptMatch) {
      const [, field, type] = deepOptMatch;
      const v = `__r_${field}`;
      lines.push(`if (data.${field} !== undefined) {`);
      lines.push(`  const ${v} = ${type}.tryNew(data.${field});`);
      lines.push(`  if (!${v}.ok) return ${v};`);
      lines.push(`  data.${field} = ${v}.value;`);
      lines.push(`}`);
      continue;
    }
    // Unknown guard shape — pass through verbatim; the user can still
    // rely on the throwing fallback inside their tryNew body.
    lines.push(g);
  }
  const body = lines.map((l) => `  ${l}`).join("\n");
  // Add the `_struct` brand to the returned value, mirroring `new`.
  return `tryNew(data: Omit<${target}, "_struct">): Result<${target}, ConstraintError> {\n${body}\n  return Ok({ ...data, _struct: ${JSON.stringify(target)} } as ${target});\n}`;
}

function renderMethod(m: M.ImplMethod, prependGuards: readonly string[]): string {
  const async = m.isAsync ? "async " : "";
  const loweredBody = m.body;
  if (prependGuards.length === 0) {
    return `${async}${m.name}${m.signature} ${loweredBody}`;
  }
  // Splice the guards right after the opening `{` of the body.
  if (!loweredBody.startsWith("{")) return `${async}${m.name}${m.signature} ${loweredBody}`;
  const indented = prependGuards.map((g) => `  ${g}`).join("\n");
  const newBody = `{\n${indented}\n${loweredBody.slice(1)}`;
  return `${async}${m.name}${m.signature} ${newBody}`;
}

function collectGuards(
  struct: M.StructDecl,
  registry: MacroRegistry,
  ctx: MacroContext
): string[] {
  const lines: string[] = [];

  // Deep validation: when a field's type is another struct declared in
  // the same module, chain through its `new` factory so its constraints
  // run too. Cross-module struct fields opt in via `#[deep]`.
  const sameModuleStructs = new Set<string>();
  for (const p of ctx.module.parts) {
    if (p.kind === "struct") sameModuleStructs.add(p.name);
  }
  for (const f of struct.fields) {
    const hasDeepAttr = f.attrs.some((a) => a.name === "deep");
    const bareType = bareIdentifier(f.type);
    const sameModuleStruct = bareType && sameModuleStructs.has(bareType);
    if (!hasDeepAttr && !sameModuleStruct) continue;
    if (!bareType) continue;
    if (f.optional) {
      lines.push(
        `if (data.${f.name} !== undefined) data.${f.name} = ${bareType}.new(data.${f.name});`
      );
    } else {
      lines.push(`data.${f.name} = ${bareType}.new(data.${f.name});`);
    }
  }

  for (const f of struct.fields) {
    for (const a of f.attrs) {
      const macro = registry.fieldConstraint(a.name);
      if (!macro) continue;
      for (const line of macro.emit(ctx, { struct, field: f, attr: a })) {
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * Return the bare type identifier if the type text is a single
 * PascalCase identifier (i.e. a candidate for a struct with a `new`
 * factory). Returns undefined for primitives, arrays, generics, and
 * unions — those need explicit handling.
 */
function bareIdentifier(typeText: string): string | undefined {
  const t = typeText.trim();
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(t)) return undefined;
  // Known JS / DOM built-ins that won't have a neoc-style `new(data)` factory.
  const BUILTIN = new Set([
    "Date",
    "RegExp",
    "Error",
    "Map",
    "Set",
    "Array",
    "Object",
    "Promise",
    "Number",
    "String",
    "Boolean",
    "Symbol",
    "BigInt",
    "URL",
    "Response",
    "Request",
  ]);
  if (BUILTIN.has(t)) return undefined;
  return t;
}

function collectDerives(
  struct: M.StructDecl,
  impl: M.ImplDecl,
  registry: MacroRegistry,
  ctx: MacroContext
): string[] {
  const out: string[] = [];
  for (const a of struct.attrs) {
    if (a.name !== "derive") continue;
    for (const traitName of a.argList) {
      const macro = registry.derive(traitName);
      if (!macro) {
        ctx.error(`unknown derive: ${traitName}`, a.span);
        continue;
      }
      out.push(macro.emit(ctx, { struct, impl }));
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// function — runs function-attr macros (route verbs, etc.)
// ----------------------------------------------------------------------------

function emitFunction(
  fn: M.FunctionDecl,
  registry: MacroRegistry,
  ctx: MacroContext
): string {
  // For each attribute that has a registered macro, apply it. Later
  // macros see prior macros' replacements via fn.body. (Not yet wired —
  // first wrapper wins for the prototype.)
  for (const a of fn.attrs) {
    const macro = registry.functionAttr(a.name);
    if (!macro) continue;
    const r = macro.emit(ctx, { fn, attr: a });
    if (r.replacement.length > 0) return r.replacement;
  }
  return renderFunctionVerbatim(fn);
}

/**
 * Build a unified `from()` dispatcher from multiple `impl From<T> for Foo`
 * blocks. Each block's body becomes a `__from_<key>` helper; the
 * dispatcher TS-overloads on every source type and discriminates at
 * runtime by `typeof`. Non-primitive source types are handled by
 * order-of-impl fallthrough — the last non-primitive From impl gets the
 * `else` branch.
 */
function renderFromDispatcher(
  targetName: string,
  fromImpls: readonly M.ImplDecl[]
): { helpers: string[]; dispatcher: string } {
  const helpers: string[] = [];
  const callableSignatures: string[] = [];
  const dispatchBranches: string[] = [];
  const sourceTypes: string[] = [];

  for (let i = 0; i < fromImpls.length; i++) {
    const t = fromImpls[i]!;
    const sourceType = (t.traitArgs ?? "")
      .replace(/^</, "")
      .replace(/>$/, "")
      .trim();
    if (sourceType.length === 0) continue;
    sourceTypes.push(sourceType);
    const method = t.methods.find((m) => m.name === "from");
    if (!method) continue;
    const key = sanitiseTypeKey(sourceType, i);
    const helperName = `__from_${key}`;
    helpers.push(`${helperName}${method.signature} ${method.body}`);
    callableSignatures.push(`(value: ${sourceType}): ${targetName};`);
    const guard = typeofGuard(sourceType, "value");
    if (guard) {
      dispatchBranches.push(
        `if (${guard}) return ${targetName}.${helperName}(value as ${sourceType});`
      );
    } else {
      // Non-primitive: best-effort try-cast fallthrough.
      dispatchBranches.push(
        `try { return ${targetName}.${helperName}(value as ${sourceType}); } catch {}`
      );
    }
  }

  // Object-literal property syntax doesn't allow bare overload signatures.
  // Instead we cast an arrow function to a callable-with-overloads type:
  // `{ (a: X): R; (a: Y): R }` IS the overloaded function type.
  const overloadType = `{ ${callableSignatures.join(" ")} }`;
  const dispatcher = [
    `from: ((value: ${sourceTypes.join(" | ")}): ${targetName} => {`,
    ...dispatchBranches.map((b) => `  ${b}`),
    `  throw new Error(${JSON.stringify(`${targetName}.from: no matching From impl`)});`,
    `}) as ${overloadType}`,
  ].join("\n");

  return { helpers, dispatcher };
}

/**
 * Return a `typeof value === "X"` check when the source type is a
 * primitive neoc can discriminate at runtime. Undefined for object /
 * named / union types — the dispatcher falls through to those.
 */
function typeofGuard(sourceType: string, valueExpr: string): string | undefined {
  const t = sourceType.trim();
  if (t === "string") return `typeof ${valueExpr} === "string"`;
  if (t === "number") return `typeof ${valueExpr} === "number"`;
  if (t === "boolean") return `typeof ${valueExpr} === "boolean"`;
  if (t === "bigint") return `typeof ${valueExpr} === "bigint"`;
  return undefined;
}

/** Convert a TS type text into a safe helper-method-name suffix. */
function sanitiseTypeKey(typeText: string, fallbackIndex: number): string {
  const cleaned = typeText.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  if (cleaned.length === 0) return `t${fallbackIndex}`;
  return cleaned;
}

/**
 * Build a minimal `impl Foo { new(data) { return { ...data, _struct: "Foo" }; } }`
 * synthetic record so derives / trait impls have a const block to land in
 * even when the user didn't write an explicit inherent impl. The
 * branded `_struct` field is what makes `match err { Foo => … }`
 * dispatch correctly across a union of structs.
 *
 * The `data` parameter is typed as `Omit<Foo, "_struct">` — the user
 * passes the data shape *without* the brand; `new` adds it.
 */
function synthesiseInherentImpl(s: M.StructDecl): M.ImplDecl {
  return {
    kind: "impl",
    name: s.name,
    exported: true,
    methods: [
      {
        name: "new",
        signature: `(data: Omit<${s.name}, "_struct">): ${s.name}`,
        params: `data: Omit<${s.name}, "_struct">`,
        returnType: s.name,
        body: `{ return { ...data, _struct: ${JSON.stringify(s.name)} }; }`,
        attrs: [],
        isAsync: false,
        span: { start: s.span.end, end: s.span.end },
      },
    ],
    attrs: [],
    span: { start: s.span.end, end: s.span.end },
  };
}

function renderFunctionVerbatim(fn: M.FunctionDecl): string {
  const prefix = fn.exported ? "export " : "";
  const async = fn.isAsync ? "async " : "";
  const body = fn.body;
  return `${prefix}${async}function ${fn.name}${fn.signature} ${body}`;
}

