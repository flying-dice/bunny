/**
 * Type IR for neoc inference.
 *
 * Every typed expression resolves to one of these. Constructors stay
 * small on purpose — the closer the IR sits to the grammar, the
 * easier subsequent rounds can add operations (subtype check,
 * unification, narrowing) without reshaping the existing nodes.
 *
 *   Primitive   — `number`, `string`, `bool`, `nil`, `void`, `any`
 *   Struct      — a declared struct identified by name; fields lazy
 *   Union       — `A | B | C`; commutative, no duplicates kept
 *   Fn          — function signature: params (named) + return
 *   Generic     — a type parameter placeholder (`T` in `<T>`)
 *   Tuple       — multi-value return from Lua-shaped fns
 *   Unknown     — placeholder for an unresolved expression; behaves
 *                 like `any` for now but tools can highlight it
 */

export type Type =
  | PrimitiveType
  | StructType
  | UnionType
  | FnType
  | GenericType
  | TupleType
  | UnknownType;

export type PrimitiveName =
  | "number"
  | "string"
  | "bool"
  | "nil"
  | "void"
  | "any"
  | "table";

export interface PrimitiveType {
  kind: "primitive";
  name: PrimitiveName;
}

export interface StructType {
  kind: "struct";
  name: string;
}

export interface UnionType {
  kind: "union";
  variants: Type[];
}

export interface FnParam {
  name: string;
  type: Type;
}

export interface FnType {
  kind: "fn";
  params: FnParam[];
  ret: Type;
}

export interface GenericType {
  kind: "generic";
  name: string;
}

export interface TupleType {
  kind: "tuple";
  elements: Type[];
}

export interface UnknownType {
  kind: "unknown";
  /** Why we couldn't resolve. Surfaced in diagnostics + hover. */
  reason?: string;
}

// ----------------------------------------------------------------------------
// Constructors
// ----------------------------------------------------------------------------

export const Type = {
  primitive(name: PrimitiveName): PrimitiveType {
    return { kind: "primitive", name };
  },
  struct(name: string): StructType {
    return { kind: "struct", name };
  },
  union(variants: Type[]): Type {
    // Flatten nested unions, dedupe by display, collapse single-variant
    // unions back to the bare type.
    const flat: Type[] = [];
    for (const v of variants) {
      if (v.kind === "union") flat.push(...v.variants);
      else flat.push(v);
    }
    const seen = new Map<string, Type>();
    for (const v of flat) seen.set(display(v), v);
    const list = [...seen.values()];
    if (list.length === 1) return list[0]!;
    return { kind: "union", variants: list };
  },
  fn(params: FnParam[], ret: Type): FnType {
    return { kind: "fn", params, ret };
  },
  generic(name: string): GenericType {
    return { kind: "generic", name };
  },
  tuple(elements: Type[]): TupleType {
    return { kind: "tuple", elements };
  },
  unknown(reason?: string): UnknownType {
    return { kind: "unknown", reason };
  },
} as const;

// Common pre-built singletons.
export const NUMBER = Type.primitive("number");
export const STRING = Type.primitive("string");
export const BOOL = Type.primitive("bool");
export const NIL = Type.primitive("nil");
export const VOID = Type.primitive("void");
export const ANY = Type.primitive("any");
export const TABLE = Type.primitive("table");
export const UNKNOWN = Type.unknown();

// ----------------------------------------------------------------------------
// Display + structural equality
// ----------------------------------------------------------------------------

/**
 * Render a type as its source-equivalent string. Used for hover
 * tooltips, diagnostic messages, and the dedupe key inside unions.
 */
export function display(t: Type): string {
  switch (t.kind) {
    case "primitive": return t.name;
    case "struct": return t.name;
    case "union": return t.variants.map(display).join(" | ");
    case "fn": {
      const ps = t.params.map((p) => `${p.name}: ${display(p.type)}`).join(", ");
      return `fn(${ps}) -> ${display(t.ret)}`;
    }
    case "generic": return t.name;
    case "tuple": return `(${t.elements.map(display).join(", ")})`;
    case "unknown": return t.reason ? `unknown<${t.reason}>` : "unknown";
  }
}

/**
 * Structural equality. `unknown` matches anything (per the V1 "lossy"
 * contract — diagnostics about Unknown propagation belong in their
 * own pass).
 */
export function equals(a: Type, b: Type): boolean {
  if (a === b) return true;
  if (a.kind === "unknown" || b.kind === "unknown") return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return a.name === (b as PrimitiveType).name;
    case "struct":
      return a.name === (b as StructType).name;
    case "union": {
      const bv = (b as UnionType).variants;
      if (a.variants.length !== bv.length) return false;
      const bSet = new Set(bv.map(display));
      return a.variants.every((v) => bSet.has(display(v)));
    }
    case "fn": {
      const bf = b as FnType;
      if (a.params.length !== bf.params.length) return false;
      if (!equals(a.ret, bf.ret)) return false;
      return a.params.every((p, i) => equals(p.type, bf.params[i]!.type));
    }
    case "generic":
      return a.name === (b as GenericType).name;
    case "tuple": {
      const bt = b as TupleType;
      if (a.elements.length !== bt.elements.length) return false;
      return a.elements.every((e, i) => equals(e, bt.elements[i]!));
    }
  }
}

// ----------------------------------------------------------------------------
// Parsing types from neoc source text
// ----------------------------------------------------------------------------

/**
 * Parse a type annotation string (verbatim source as captured by the
 * adapter) into a Type. Handles the common cases the rest of the
 * inference engine needs:
 *
 *   string, number, bool, nil, void, any, table     → Primitive
 *   Foo, Result, Option                              → Struct (by name)
 *   A | B | C                                        → Union
 *   <empty>                                          → Unknown
 *
 * Anything more elaborate (generics, function types, tuple returns)
 * resolves to Unknown for now. The inference push expands this.
 */
export function parseType(source: string): Type {
  const trimmed = source.trim();
  if (trimmed.length === 0) return UNKNOWN;
  if (trimmed.includes("|")) {
    const variants = splitTopLevel(trimmed, "|").map((s) => parseType(s));
    return Type.union(variants);
  }
  switch (trimmed) {
    case "number": return NUMBER;
    case "string": return STRING;
    case "bool": return BOOL;
    case "nil": return NIL;
    case "void": return VOID;
    case "any": return ANY;
    case "table": return TABLE;
  }
  // Bare uppercase identifier → struct reference. Anything else
  // (generics, conditional types, function types) is Unknown for v1.
  if (/^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) return Type.struct(trimmed);
  return Type.unknown(trimmed);
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && c === sep) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}
