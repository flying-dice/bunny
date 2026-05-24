/**
 * Lua 5.4 codegen — neoc AST → `.lua` source.
 *
 * Layout per emitted module:
 *
 *   1. (optional) Result / Ok / Err prelude when the module uses them.
 *   2. Walk every part:
 *      - OpaqueText      → push verbatim (the author writes Lua there).
 *      - StructDecl      → render the factory function, attach metatable,
 *                          weave field-constraint macro checks into `.new`.
 *      - ImplDecl        → attach methods onto the target struct's table,
 *                          including trait impls (Lua has no interface
 *                          concept; trait dispatch is duck-typed at
 *                          runtime so we just install the methods).
 *      - TraitDecl       → no direct emit (Lua doesn't need an interface
 *                          declaration). Default methods land on the
 *                          implementing struct via the impl pass.
 *      - FunctionDecl    → top-level local or global function.
 *
 * Exports translate to Lua globals; un-exported declarations are `local`.
 * mlua-hosted scripts share their globals with the host, which is the
 * common interop pattern.
 */

import * as M from "../../ast/index.ts";
import { type MacroContext, MacroRegistry } from "../../macros/registry.ts";

export interface EmitChunk {
  text: string;
  sourceOffset?: number;
}

export interface EmitResult {
  lua: string;
  diagnostics: M.ParseDiagnostic[];
  chunks: EmitChunk[];
  /** True iff the module references Result / Ok / Err. */
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
  const state = { usesResult: false };

  const ctx: MacroContext = {
    module,
    sourcePath: options.sourcePath,
    error(message, span) {
      diagnostics.push({ message, span });
    },
    appendModule(text) {
      moduleAppend += (moduleAppend.length > 0 ? "\n" : "") + text;
    },
    appendToRecord() {
      // Record machinery was a TS / Bun.serve concern (routes, openapi,
      // client). Lua-targeting macros use `appendModule` directly.
    },
  };

  // Index structs by name so impl-side derives can read their fields.
  const structByName = new Map<string, M.StructDecl>();
  const traitByName = new Map<string, M.TraitDecl>();
  for (const p of module.parts) {
    if (p.kind === "struct") structByName.set(p.name, p);
    else if (p.kind === "trait") traitByName.set(p.name, p);
  }

  // Group impls by target so derives + trait-impls all land on the
  // same struct in one pass.
  const inherentByName = new Map<string, M.ImplDecl>();
  const traitImplsByTarget = new Map<string, M.ImplDecl[]>();
  for (const p of module.parts) {
    if (p.kind !== "impl") continue;
    if (p.traitName) {
      const arr = traitImplsByTarget.get(p.name) ?? [];
      arr.push(p);
      traitImplsByTarget.set(p.name, arr);
    } else {
      inherentByName.set(p.name, p);
    }
  }

  const handled = new Set<M.ModulePart>();

  for (const part of module.parts) {
    switch (part.kind) {
      case "opaque":
        push(translateOpaque(part.text), part.span.start);
        break;
      case "struct": {
        push(emitStruct(part, registry, ctx, state), part.span.start);
        const inh = inherentByName.get(part.name);
        const traitImpls = traitImplsByTarget.get(part.name) ?? [];
        const hasDerives = part.attrs.some((a) => a.name === "derive");
        if (inh || traitImpls.length > 0 || hasDerives) {
          push("\n", part.span.start);
          push(emitImpls(part, inh, traitImpls, registry, ctx, traitByName, state), part.span.start);
          if (inh) handled.add(inh);
          for (const t of traitImpls) handled.add(t);
        }
        break;
      }
      case "impl":
        if (handled.has(part)) break;
        // Inherent or trait impl whose target struct lives in another
        // module — emit on its own.
        push(emitImpls({ kind: "struct", name: part.name, span: part.span, fields: [], generics: "", attrs: [], exported: false } as M.StructDecl, part.traitName ? undefined : part, part.traitName ? [part] : [], registry, ctx, traitByName, state), part.span.start);
        break;
      case "trait":
        // Lua has no interface declaration. Trait default methods land
        // on impl sites via emitImpls. Nothing to emit here.
        break;
      case "function": {
        let replaced: string | undefined;
        for (const attr of part.attrs) {
          const m = registry.functionAttr(attr.name);
          if (!m) continue;
          const result = m.emit(ctx, { fn: part, attr });
          if (result.replacement.length > 0) replaced = result.replacement;
        }
        push(replaced ?? emitFunction(part), part.span.start);
        break;
      }
      case "extern_function":
        // No emit — the signature exists purely for inference and the
        // LSP. The runtime is responsible for providing the binding.
        break;
    }
  }

  if (moduleAppend.length > 0) {
    push("\n");
    push(moduleAppend);
    push("\n");
  }

  let lua = chunks.map((c) => c.text).join("");
  // Detect Result/Ok/Err usage by simple text scan — the AST keeps method
  // bodies as opaque Lua, so we look for the bare identifiers there.
  if (/\bOk\s*\(|\bErr\s*\(|\bResult\b/.test(lua)) state.usesResult = true;
  if (state.usesResult) lua = RESULT_PRELUDE + "\n" + lua;
  return { lua, diagnostics, chunks, usesResult: state.usesResult };
}

// ----------------------------------------------------------------------------
// Result prelude
// ----------------------------------------------------------------------------

const RESULT_PRELUDE = `-- neoc Result prelude
local function Ok(value) return { ok = true, value = value } end
local function Err(error) return { ok = false, error = error } end
`;

// ----------------------------------------------------------------------------
// struct
// ----------------------------------------------------------------------------

function emitStruct(
  s: M.StructDecl,
  registry: MacroRegistry,
  ctx: MacroContext,
  state: { usesResult: boolean }
): string {
  const decl = s.exported ? s.name : `local ${s.name}`;
  const lines: string[] = [];
  lines.push(`${decl} = {}`);
  lines.push(`${s.name}.__index = ${s.name}`);

  // Field-constraint guards.
  const guards: string[] = [];
  for (const field of s.fields) {
    for (const attr of field.attrs) {
      const m = registry.fieldConstraint(attr.name);
      if (!m) {
        ctx.error(`unknown field constraint: ${attr.name}`, attr.span);
        continue;
      }
      const lines = m.emit(ctx, { struct: s, field, attr });
      for (const line of lines) guards.push(line);
    }
  }

  lines.push(`function ${s.name}.new(data)`);
  for (const g of guards) lines.push(`  ${g}`);
  lines.push(`  data._struct = "${s.name}"`);
  lines.push(`  setmetatable(data, ${s.name})`);
  lines.push(`  return data`);
  lines.push(`end`);
  return lines.join("\n") + "\n";
}

// ----------------------------------------------------------------------------
// impl / trait impl
// ----------------------------------------------------------------------------

function emitImpls(
  struct: M.StructDecl,
  inherent: M.ImplDecl | undefined,
  traitImpls: M.ImplDecl[],
  registry: MacroRegistry,
  ctx: MacroContext,
  traitByName: Map<string, M.TraitDecl>,
  state: { usesResult: boolean }
): string {
  const target = struct.name;
  const out: string[] = [];

  // Inherent impl methods.
  if (inherent) {
    for (const m of inherent.methods) {
      out.push(renderMethod(target, m));
    }
  }

  // Derive macros — only when an inherent impl is present (or struct
  // implies one); a derive without a target struct is a no-op.
  for (const attr of struct.attrs) {
    if (attr.name !== "derive") continue;
    for (const inner of attr.argList) {
      const deriveName = inner.trim();
      const m = registry.derive(deriveName);
      if (!m) {
        ctx.error(`unknown derive: ${deriveName}`, attr.span);
        continue;
      }
      const snippet = m.emit(ctx, { struct, impl: inherent });
      out.push(snippet);
    }
  }

  // Trait impls.
  for (const ti of traitImpls) {
    const trait = traitByName.get(ti.traitName!);
    // User-supplied trait methods.
    const supplied = new Set(ti.methods.map((m) => m.name));
    for (const m of ti.methods) {
      out.push(renderMethod(target, m));
    }
    // Default-bodied trait methods that the impl didn't override.
    if (trait) {
      for (const dm of trait.methods) {
        if (dm.body === undefined) continue;
        if (supplied.has(dm.name)) continue;
        out.push(renderTraitDefaultMethod(target, dm));
      }
    }
  }

  return out.join("\n") + (out.length > 0 ? "\n" : "");
}

function renderMethod(target: string, m: M.ImplMethod): string {
  const paramNames = parseParamNames(m.params);
  const paramList = paramNames.join(", ");
  const body = stripBraces(m.body);
  return `function ${target}.${m.name}(${paramList})\n  ${indent(body)}\nend`;
}

// Trait method's default body, rendered onto the implementing struct
// when the impl block omits an explicit override.
function renderTraitDefaultMethod(target: string, m: M.TraitMethod): string {
  const paramNames = parseParamNames(m.params);
  const paramList = paramNames.join(", ");
  const body = stripBraces(m.body ?? "").replace(/\bSelf\b/g, target);
  return `function ${target}.${m.name}(${paramList})\n  ${indent(body)}\nend`;
}

function stripBraces(body: string): string {
  return body.replace(/^\s*\{|\}\s*$/g, "").trim();
}

function indent(body: string): string {
  return body.replace(/\n/g, "\n  ");
}

// ----------------------------------------------------------------------------
// function
// ----------------------------------------------------------------------------

function emitFunction(fn: M.FunctionDecl): string {
  const paramNames = parseParamNames(fn.params);
  const paramList = paramNames.join(", ");
  const body = stripBraces(fn.body);
  const prefix = fn.exported ? "function" : "local function";
  return `${prefix} ${fn.name}(${paramList})\n  ${indent(body)}\nend\n`;
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function parseParamNames(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  const parts: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { parts.push(raw.slice(last, i)); last = i + 1; }
  }
  if (last <= raw.length) parts.push(raw.slice(last));
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // Pull the name out before the colon (or use the whole thing if no `:`).
    const colon = topLevelColon(trimmed);
    const namePart = colon < 0 ? trimmed : trimmed.slice(0, colon);
    const name = namePart.trim().replace(/[?].*$/, "").replace(/\s*=.*$/, "");
    if (name) out.push(name);
  }
  return out;
}

// Translate JS-flavoured constructs that live in OpaqueText gaps —
// doc comments above declarations, `//` line comments, and ES-style
// `import { … } from "…"` statements — into their Lua equivalents.
// Anything else passes through unchanged.
function translateOpaque(text: string): string {
  let out = text.replace(IMPORT_RE, (_match, names: string, modulePath: string) => {
    return renderImport(names, modulePath);
  });
  out = out.replace(IMPORT_TYPE_RE, "");
  out = out.replace(NAMESPACE_IMPORT_RE, (_match, alias: string, modulePath: string) => {
    return `local ${alias} = require(${luaModuleString(modulePath)})`;
  });
  out = out.replace(DEFAULT_IMPORT_RE, (_match, alias: string, modulePath: string) => {
    return `local ${alias} = require(${luaModuleString(modulePath)})`;
  });
  // `type X = …` aliases are TS-level type-system constructs — they
  // emit no Lua. Drop them when they appear in opaque-text gaps.
  out = out.replace(TYPE_ALIAS_RE, "");
  return out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/^\s+/, "");
      if (trimmed.startsWith("///")) {
        return line.replace(/^(\s*)\/\/\//, "$1---");
      }
      if (trimmed.startsWith("//")) {
        return line.replace(/^(\s*)\/\//, "$1--");
      }
      return line;
    })
    .join("\n");
}

// `import { Foo, Bar as B } from "./mod"` →
//   local __mod = require("./mod")
//   local Foo = __mod.Foo
//   local B = __mod.Bar
const IMPORT_RE = /\bimport\s*\{\s*([^}]*?)\s*\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;
// `type Foo = A | B | C` — match until end-of-line. The expression can
// be a union, intersection, generic, or bare identifier; the whole line
// is dropped in Lua output.
const TYPE_ALIAS_RE = /^\s*type\s+\w+\s*=[^\n]*\n?/gm;
// `import type { … } from "…"` — type-only, no runtime effect, drop entirely.
const IMPORT_TYPE_RE = /\bimport\s+type\s*\{\s*[^}]*?\s*\}\s*from\s*['"][^'"]+['"]\s*;?/g;
// `import * as Foo from "./mod"` → local Foo = require("./mod")
const NAMESPACE_IMPORT_RE = /\bimport\s*\*\s*as\s+(\w+)\s*from\s*['"]([^'"]+)['"]\s*;?/g;
// `import Foo from "./mod"` → local Foo = require("./mod")
const DEFAULT_IMPORT_RE = /\bimport\s+(\w+)\s+from\s*['"]([^'"]+)['"]\s*;?/g;

function renderImport(namesRaw: string, modulePath: string): string {
  const entries = namesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return "";
  const modVar = "__mod_" + Math.random().toString(36).slice(2, 8);
  const lines: string[] = [`local ${modVar} = require(${luaModuleString(modulePath)})`];
  for (const entry of entries) {
    // `Foo` or `Foo as Bar`
    const aliasMatch = entry.match(/^(\w+)\s+as\s+(\w+)$/);
    if (aliasMatch) {
      const [, source, alias] = aliasMatch;
      lines.push(`local ${alias} = ${modVar}.${source}`);
    } else {
      lines.push(`local ${entry} = ${modVar}.${entry}`);
    }
  }
  return lines.join("\n");
}

// Convert a `.neoc` (or `.ts`) module specifier into a Lua module
// string. We strip the file extension — Lua's `require` expects a
// module path, not a file path.
function luaModuleString(path: string): string {
  const stripped = path.replace(/\.(neoc|ts|lua)$/, "");
  return `"${stripped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function topLevelColon(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}
