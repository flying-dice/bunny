/**
 * Lexical scope tracker for inference.
 *
 * `TypeEnv` is a chained map from identifier → type. `push` opens a
 * fresh scope (function body, match-arm binding, block expression);
 * `pop` discards it. Lookups walk the chain outward until the name
 * is found, falling back to `undefined` for unbound identifiers (the
 * inference engine turns those into `unknown<unbound: <name>>`).
 *
 * The module-level scope is built once from the parsed `Module` (see
 * `buildModuleScope`), so cross-symbol references in the same file
 * resolve without needing the workspace symbol index for everything.
 */

import type * as M from "../ast/index.ts";
import { type Type, parseType, UNKNOWN } from "./type.ts";

export interface ScopeEntry {
  type: Type;
  /** Hover detail / definition kind — `fn`, `struct`, `param`, `local`. */
  kind: ScopeEntryKind;
}

export type ScopeEntryKind = "fn" | "ext_fn" | "struct" | "trait" | "param" | "local";

export class TypeEnv {
  private readonly stack: Map<string, ScopeEntry>[] = [new Map()];

  push(): void {
    this.stack.push(new Map());
  }

  pop(): void {
    if (this.stack.length <= 1) {
      throw new Error("TypeEnv: cannot pop the module scope");
    }
    this.stack.pop();
  }

  define(name: string, entry: ScopeEntry): void {
    this.stack[this.stack.length - 1]!.set(name, entry);
  }

  lookup(name: string): ScopeEntry | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const scope = this.stack[i]!;
      const hit = scope.get(name);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Pure inspection — every name visible at the current scope. */
  visibleNames(): string[] {
    const out = new Set<string>();
    for (const s of this.stack) for (const k of s.keys()) out.add(k);
    return [...out];
  }
}

// ----------------------------------------------------------------------------
// Module-level scope construction
// ----------------------------------------------------------------------------

/**
 * Seed a fresh `TypeEnv` with every top-level declaration in a parsed
 * module — structs, traits, regular functions, and `ext fn` bindings.
 * Body bodies are NOT walked here; subsequent rounds add the
 * statement-level inference that opens nested scopes as needed.
 */
export function buildModuleScope(module: M.Module): TypeEnv {
  const env = new TypeEnv();
  for (const part of module.parts) {
    switch (part.kind) {
      case "struct":
        env.define(part.name, { type: { kind: "struct", name: part.name }, kind: "struct" });
        break;
      case "trait":
        env.define(part.name, { type: UNKNOWN, kind: "trait" });
        break;
      case "function":
        env.define(part.name, {
          type: fnType(part.params, part.returnType),
          kind: "fn",
        });
        break;
      case "extern_function":
        env.define(part.name, {
          type: fnType(part.params, part.returnType),
          kind: "ext_fn",
        });
        break;
      case "impl":
      case "opaque":
        // Impl blocks contribute methods to the struct's type, not the
        // module scope. Opaque parts have no symbols to bind.
        break;
    }
  }
  return env;
}

/**
 * Build a `Type.fn(...)` from the verbatim `params` / `returnType`
 * strings the adapter captures. Anything we can't parse falls back
 * to `Unknown` for that slot — refined as the inference rules grow.
 */
function fnType(paramsText: string, returnTypeText: string): Type {
  const params = paramsText.length === 0 ? [] : splitParams(paramsText);
  return {
    kind: "fn",
    params: params.map((p) => ({ name: p.name, type: parseType(p.type) })),
    ret: parseType(returnTypeText),
  };
}

function splitParams(text: string): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if ((c === "," && depth === 0) || i === text.length) {
      const chunk = text.slice(start, i).trim();
      if (chunk.length > 0) out.push(parseParam(chunk));
      start = i + 1;
    }
  }
  return out;
}

function parseParam(text: string): { name: string; type: string } {
  const colon = text.indexOf(":");
  if (colon < 0) return { name: text.trim(), type: "" };
  return {
    name: text.slice(0, colon).trim().replace(/[?].*$/, ""),
    type: text.slice(colon + 1).trim(),
  };
}
