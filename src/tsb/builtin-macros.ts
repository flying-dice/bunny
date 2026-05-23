/**
 * Built-in macros that ship with the tsb compiler. They use the same
 * public API as user-authored macros — there's no special "built-in" path.
 *
 * Phase 1 covers a representative slice:
 *
 *   - Field-constraint macros: minLength, maxLength, minimum, maximum,
 *     format (regex-backed), pattern.
 *   - Derive macros: Clone, Equals, ToJson, Display.
 *
 * Function-attribute macros (route verbs, etc.) and a richer derive
 * vocabulary land in later passes.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";
import * as M from "./model.ts";
import type {
  DeriveMacro,
  FieldConstraintMacro,
  FunctionAttrMacro,
  Macro,
  MacroRegistry,
} from "./macros.ts";

/** Register every built-in macro on the given registry. */
export function registerBuiltins(registry: MacroRegistry): void {
  for (const m of builtins) registry.register(m);
}

const FORMAT_REGEX_LITERAL: Record<string, string> = {
  uuid: "/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i",
  email: "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/",
  "date-time":
    "/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?$/",
  date: "/^\\d{4}-\\d{2}-\\d{2}$/",
  time: "/^\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?$/",
  ipv4: "/^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/",
};

const FORMAT_LABEL: Record<string, string> = {
  uuid: "UUID",
  email: "email address",
  "date-time": "ISO 8601 date-time",
  date: "ISO 8601 date",
  time: "ISO 8601 time",
  ipv4: "IPv4 address",
};

// ----------------------------------------------------------------------------
// Field constraints — inject guards into the impl's `new` method.
// ----------------------------------------------------------------------------

const minLength: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "minLength",
  emit(_ctx, { field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if (typeof data.${field.name} !== "string") throw new Error("${field.name} must be a string");`,
      `if (data.${field.name}.length < ${n}) throw new Error("${field.name} must be at least ${n} character${n === "1" ? "" : "s"}");`,
    ];
  },
};

const maxLength: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "maxLength",
  emit(_ctx, { field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if (data.${field.name}.length > ${n}) throw new Error("${field.name} must be at most ${n} character${n === "1" ? "" : "s"}");`,
    ];
  },
};

const minimum: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "minimum",
  emit(_ctx, { field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if (typeof data.${field.name} !== "number" || Number.isNaN(data.${field.name})) throw new Error("${field.name} must be a number");`,
      `if (data.${field.name} < ${n}) throw new Error("${field.name} must be >= ${n}");`,
    ];
  },
};

const maximum: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "maximum",
  emit(_ctx, { field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if (data.${field.name} > ${n}) throw new Error("${field.name} must be <= ${n}");`,
    ];
  },
};

const format: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "format",
  emit(_ctx, { field, attr }) {
    const fmt = attr.argList[0] ?? "";
    const re = FORMAT_REGEX_LITERAL[fmt];
    const label = FORMAT_LABEL[fmt] ?? fmt;
    if (!re) {
      return [
        `// unknown format ${fmt} on field ${field.name} — no guard emitted`,
      ];
    }
    return [
      `if (typeof data.${field.name} !== "string") throw new Error("${field.name} must be a string");`,
      `if (!${re}.test(data.${field.name})) throw new Error("${field.name} must be a valid ${label}");`,
    ];
  },
};

const pattern: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "pattern",
  emit(_ctx, { field, attr }) {
    const re = attr.argList[0] ?? "";
    return [
      `if (typeof data.${field.name} !== "string") throw new Error("${field.name} must be a string");`,
      `if (!/${re}/.test(data.${field.name})) throw new Error("${field.name} must match ${re}");`,
    ];
  },
};

// ----------------------------------------------------------------------------
// Derives — append methods to the impl.
// ----------------------------------------------------------------------------

const deriveClone: DeriveMacro = {
  kind: "derive",
  name: "Clone",
  emit(_ctx, { struct }) {
    const fields = struct.fields.map((f) => `${f.name}: self.${f.name}`).join(",\n    ");
    return `clone(self: ${struct.name}): ${struct.name} {\n  return {\n    ${fields}\n  };\n}`;
  },
};

const deriveEquals: DeriveMacro = {
  kind: "derive",
  name: "Equals",
  emit(_ctx, { struct }) {
    if (struct.fields.length === 0) {
      return `equals(_a: ${struct.name}, _b: ${struct.name}): boolean { return true; }`;
    }
    const comparisons = struct.fields
      .map((f) => `a.${f.name} === b.${f.name}`)
      .join(" && ");
    return `equals(a: ${struct.name}, b: ${struct.name}): boolean {\n  return ${comparisons};\n}`;
  },
};

const deriveToJson: DeriveMacro = {
  kind: "derive",
  name: "ToJson",
  emit(_ctx, { struct }) {
    return [
      `toJson(self: ${struct.name}): string { return JSON.stringify(self); },`,
      ``,
      `fromJson(input: string): ${struct.name} { return ${struct.name}.new(JSON.parse(input) as ${struct.name}); }`,
    ].join("\n  ");
  },
};

const deriveDisplay: DeriveMacro = {
  kind: "derive",
  name: "Display",
  emit(_ctx, { struct }) {
    const parts = struct.fields
      .map((f) => `${f.name}: \${JSON.stringify(self.${f.name})}`)
      .join(", ");
    return `toString(self: ${struct.name}): string {\n  return \`${struct.name} { ${parts} }\`;\n}`;
  },
};

const deriveDefault: DeriveMacro = {
  kind: "derive",
  name: "Default",
  emit(_ctx, { struct }) {
    const fields = struct.fields.map((f) => {
      const defaultAttr = f.attrs.find((a) => a.name === "default");
      if (defaultAttr && defaultAttr.argList[0] !== undefined) {
        return `${f.name}: ${renderDefaultLiteral(defaultAttr.argList[0])}`;
      }
      return `${f.name}: ${zeroValueFor(f.type)}`;
    });
    return `default(): ${struct.name} {\n  return {\n    ${fields.join(",\n    ")}\n  };\n}`;
  },
};

const deriveHash: DeriveMacro = {
  kind: "derive",
  name: "Hash",
  emit(_ctx, { struct }) {
    // Field-by-field FNV-1a-ish over the JSON serialisation. Stable
    // across runs but not cryptographic. Good enough for cache keys.
    const fieldPairs = struct.fields
      .map((f) => `JSON.stringify(self.${f.name})`)
      .join(' + "|" + ');
    if (struct.fields.length === 0) {
      return `hash(_self: ${struct.name}): string { return "0"; }`;
    }
    return [
      `hash(self: ${struct.name}): string {`,
      `  let h = 2166136261;`,
      `  const s = ${fieldPairs};`,
      `  for (let i = 0; i < s.length; i++) {`,
      `    h ^= s.charCodeAt(i);`,
      `    h = Math.imul(h, 16777619);`,
      `  }`,
      `  return (h >>> 0).toString(16);`,
      `}`,
    ].join("\n");
  },
};

/**
 * Convert a `@default` arg back into a TS expression. argList values
 * arrive already unquoted (so `@default "blue"` is `blue` here). We use
 * a try/catch JSON parse: if the unquoted form round-trips through
 * JSON.parse we trust the value and re-emit via JSON.stringify; if
 * parsing fails it's an identifier / expression — emit as-is.
 */
function renderDefaultLiteral(raw: string): string {
  // Try as JSON first (covers numbers, booleans, null, JSON arrays/objects).
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed);
  } catch {
    // Strings (un-parseable as bare JSON) — quote them.
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw)) {
      // Looks like an identifier — emit as-is so the user can reference
      // a const from their source.
      return raw;
    }
    return JSON.stringify(raw);
  }
}

function zeroValueFor(typeText: string): string {
  const t = typeText.trim();
  if (t === "string") return '""';
  if (t === "number") return "0";
  if (t === "boolean") return "false";
  if (t.endsWith("[]") || t.startsWith("Array<")) return "[]";
  // Anything else (named types, unions, generics) — undefined is the
  // safest zero. Caller can override via @default.
  return "undefined as unknown as " + typeText.trim();
}

// ----------------------------------------------------------------------------
// Function attributes — route verbs.
// ----------------------------------------------------------------------------

const HTTP_VERBS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

const routeMacros: FunctionAttrMacro[] = HTTP_VERBS.map((verb) => ({
  kind: "function-attr" as const,
  name: verb,
  emit(ctx, { fn, attr }) {
    const rawPath = attr.argList[0] ?? "/";
    const method = verb.toUpperCase();
    const params = parseFunctionParams(fn.params);
    const pathParamNames = [...rawPath.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map(
      (m) => m[1]!
    );
    const pathParamSet = new Set(pathParamNames);
    const hasBody = ["POST", "PUT", "PATCH"].includes(method);

    // ---- routes (Bun.serve-ready handler) --------------------------------
    // Build an inline adapter expression. Each function param binds as
    // a path / body / query value; the adapter forwards them
    // positionally to the user's typed handler.
    const adapterArgs: string[] = [];
    let bodyBound = false;
    for (const p of params) {
      if (pathParamSet.has(p.name)) {
        adapterArgs.push(`(req as any).params?.${p.name}`);
      } else if (hasBody && !bodyBound) {
        adapterArgs.push(`(body as any)`);
        bodyBound = true;
      } else {
        adapterArgs.push(
          `new URL(req.url).searchParams.get(${JSON.stringify(p.name)}) ?? undefined`
        );
      }
    }
    const callExpr = `${fn.name}(${adapterArgs.join(", ")})`;
    const responseExpr = `Response.json(${callExpr})`;
    const adapter = bodyBound
      ? `async (req: Request) => { const body = await req.json(); return ${responseExpr}; }`
      : `(req: Request) => ${responseExpr}`;
    ctx.appendToRecord(
      "routes",
      JSON.stringify(rawPath),
      `{ ${method}: ${adapter} }`,
      "object"
    );

    // ---- openapi (per-path operation object) ----------------------------
    const openApiPath = rawPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
    const parameters = pathParamNames.map((n) => {
      const p = params.find((pp) => pp.name === n);
      return {
        name: n,
        in: "path",
        required: true,
        schema: tsTypeToOpenApiSchema(p?.type ?? "string"),
      };
    });
    const operation = {
      operationId: fn.name,
      parameters,
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: tsTypeToOpenApiSchema(fn.returnType.trim() || "void"),
            },
          },
        },
      },
    };
    ctx.appendToRecord(
      "openapi",
      JSON.stringify(openApiPath),
      `{ ${verb}: ${JSON.stringify(operation)} as const }`,
      "object"
    );

    // ---- client (typed fetch wrapper) -----------------------------------
    // Build the request: path params interpolate into the URL; body
    // params JSON-encode; remaining params append as query string. The
    // generated function's arg + return types are inferred from the
    // handler via `Parameters<typeof fn>` / `ReturnType<typeof fn>` so
    // the client stays in lockstep with server changes.
    const clientArgs: string[] = [];
    const clientUrlParts: string[] = [];
    const clientBodyName: string | undefined = undefined;
    const clientQueryNames: string[] = [];
    let urlBuilt = `"${rawPath}"`;
    if (pathParamNames.length > 0) {
      urlBuilt = "`" + rawPath + "`";
      for (const n of pathParamNames) {
        urlBuilt = urlBuilt.replace(
          `:${n}`,
          `\${encodeURIComponent(String(${n}))}`
        );
      }
    }
    let bodyArg: string | undefined;
    let i = 0;
    for (const p of params) {
      const ty = `Parameters<typeof ${fn.name}>[${i}]`;
      clientArgs.push(`${p.name}: ${ty}`);
      if (pathParamSet.has(p.name)) {
        // bound to URL
      } else if (hasBody && !bodyArg) {
        bodyArg = p.name;
      } else {
        clientQueryNames.push(p.name);
      }
      i++;
    }
    void clientUrlParts;
    void clientBodyName;
    const fetchInitParts: string[] = [`method: ${JSON.stringify(method)}`];
    if (bodyArg) {
      fetchInitParts.push(`headers: { "Content-Type": "application/json" }`);
      fetchInitParts.push(`body: JSON.stringify(${bodyArg})`);
    }
    let urlExpr = urlBuilt;
    if (clientQueryNames.length > 0) {
      const qsBuild = clientQueryNames
        .map(
          (n) =>
            `${JSON.stringify(n)}: ${n} as unknown`
        )
        .join(", ");
      urlExpr = `\`${urlBuilt.startsWith("`") ? urlBuilt.slice(1, -1) : rawPath}\${(() => { const __q = new URLSearchParams(); const __o: Record<string, unknown> = { ${qsBuild} }; for (const [k, v] of Object.entries(__o)) if (v !== undefined && v !== null) __q.append(k, String(v)); const __s = __q.toString(); return __s ? "?" + __s : ""; })()}\``;
    }
    const clientReturn = `Promise<Awaited<ReturnType<typeof ${fn.name}>>>`;
    const clientFn = `async (${clientArgs.join(", ")}): ${clientReturn} => {
      const __res = await fetch(${urlExpr}, { ${fetchInitParts.join(", ")} });
      if (!__res.ok) throw new Error(\`\${${JSON.stringify(method)}} \${${urlExpr}} failed: \${__res.status}\`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof ${fn.name}>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof ${fn.name}>>;
    }`;
    ctx.appendToRecord("client", fn.name, clientFn, "object");

    // The user's original function is kept verbatim by returning empty.
    return { replacement: "" };
  },
}));

/**
 * Split a function-parameter list (verbatim text, without the outer
 * parens) into `{ name, type }` pairs. Depth-aware on `<>`, `()`, `[]`,
 * `{}` so generics and inline types don't break commas.
 */
function parseFunctionParams(raw: string): { name: string; type: string }[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(raw.slice(last, i));
      last = i + 1;
    }
  }
  if (last <= raw.length) parts.push(raw.slice(last));
  const result: { name: string; type: string }[] = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.length === 0) continue;
    const colonAt = findTopLevelColon(trimmed);
    if (colonAt < 0) {
      result.push({ name: trimmed.replace(/[?=].*$/, "").trim(), type: "" });
      continue;
    }
    const nameRaw = trimmed.slice(0, colonAt).trim();
    const name = nameRaw.replace(/[?].*$/, "").trim();
    const rest = trimmed.slice(colonAt + 1).trim();
    const eqAt = findTopLevelEquals(rest);
    const type = (eqAt < 0 ? rest : rest.slice(0, eqAt)).trim();
    result.push({ name, type });
  }
  return result;
}

function findTopLevelColon(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

function findTopLevelEquals(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === "=" && depth === 0 && s[i + 1] !== "=" && s[i - 1] !== "!" && s[i - 1] !== "<" && s[i - 1] !== ">") return i;
  }
  return -1;
}

/**
 * Map a TS type expression (verbatim text) to an OpenAPI schema object.
 * Handles primitives, `T[]` / `Array<T>`, simple union of string
 * literals, and falls back to named-ref for anything else.
 */
function tsTypeToOpenApiSchema(typeText: string): Record<string, unknown> {
  const t = typeText.trim();
  if (t === "" || t === "void" || t === "undefined" || t === "null") {
    return { type: "null" };
  }
  if (t === "string") return { type: "string" };
  if (t === "number") return { type: "number" };
  if (t === "boolean") return { type: "boolean" };
  if (t === "bigint") return { type: "integer", format: "int64" };
  if (t === "Date") return { type: "string", format: "date-time" };
  if (t === "any" || t === "unknown") return {};
  if (t.endsWith("[]")) {
    return { type: "array", items: tsTypeToOpenApiSchema(t.slice(0, -2)) };
  }
  const arrayMatch = /^Array<(.+)>$/s.exec(t);
  if (arrayMatch) {
    return { type: "array", items: tsTypeToOpenApiSchema(arrayMatch[1]!) };
  }
  // String-literal union: `"a" | "b" | "c"`.
  if (t.includes("|")) {
    const parts = t.split("|").map((p) => p.trim());
    const allStringLiterals = parts.every((p) => /^"([^"]*)"$/.test(p) || /^'([^']*)'$/.test(p));
    if (allStringLiterals) {
      return {
        type: "string",
        enum: parts.map((p) => p.slice(1, -1)),
      };
    }
  }
  // Named type — emit as ref so downstream tooling can resolve.
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t)) {
    return { $ref: `#/components/schemas/${t}` };
  }
  return {};
}

// ----------------------------------------------------------------------------
// `#[sql("query-name")]` — read sibling SQL file, emit a function body
// that prepares + runs the query against an injected `db` parameter.
// ----------------------------------------------------------------------------

const sql: FunctionAttrMacro = {
  kind: "function-attr",
  name: "sql",
  emit(ctx, { fn, attr }) {
    const queryName = attr.argList[0];
    if (!queryName) {
      ctx.error(`#[sql(...)] requires a query name`, attr.span);
      return { replacement: "" };
    }
    if (!ctx.sourcePath) {
      ctx.error(
        `#[sql(...)] needs to know the source path; transpile() was called without one`,
        attr.span
      );
      return { replacement: "" };
    }
    // Search up the directory tree for `sql/${queryName}.sql`. The
    // sibling `sql/` convention typically lives at the project root (or
    // a feature folder root), not adjacent to every source module.
    const sqlPath = findSqlFile(dirname(ctx.sourcePath), queryName);
    if (!sqlPath) {
      ctx.error(
        `#[sql] could not find sql/${queryName}.sql in any parent directory of ${ctx.sourcePath}`,
        attr.span
      );
      return { replacement: "" };
    }
    let sqlText: string;
    try {
      sqlText = readFileSync(sqlPath, "utf-8");
    } catch (err) {
      ctx.error(
        `#[sql] could not read ${sqlPath}: ${err instanceof Error ? err.message : String(err)}`,
        attr.span
      );
      return { replacement: "" };
    }

    // Inspect the function signature to pick the right sqlite call.
    // `Foo[]` / `Array<Foo>` → `.all()`, void / number → `.run()` (mutation),
    // anything else → `.get()` (single row).
    const ret = fn.returnType.trim();
    const isMutation = isMutationSql(sqlText);
    const isArrayReturn = /\[\]$/.test(ret) || /^Array<.+>$/.test(ret);
    const callShape: "all" | "get" | "run" = isMutation
      ? "run"
      : isArrayReturn
        ? "all"
        : "get";

    const params = parseFunctionParams(fn.params);
    // The first parameter is the connection ("db"); subsequent params are
    // the query bindings. Bindings are passed positionally to sqlite —
    // `?` placeholders bind in declaration order.
    const [conn, ...binds] = params;
    if (!conn) {
      ctx.error(`#[sql] function must take a connection as its first param`, attr.span);
      return { replacement: "" };
    }

    // Named placeholders (`:foo`) are rewritten to positional `?` and
    // bound in the order they appear in the SQL. The function param
    // names must match the placeholder names so we can re-order.
    const namedPlaceholders = [...sqlText.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map(
      (m) => m[1]!
    );
    let normalisedSql = sqlText;
    let bindArgs: string;
    if (namedPlaceholders.length > 0) {
      normalisedSql = sqlText.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "?");
      // Bind args follow the order of `:name` occurrences in the SQL,
      // mapped to the function param of the same name.
      const paramByName = new Map(binds.map((b) => [b.name, b]));
      const orderedBinds: string[] = [];
      for (const n of namedPlaceholders) {
        const p = paramByName.get(n);
        if (!p) {
          ctx.error(
            `#[sql] placeholder :${n} has no matching function param`,
            attr.span
          );
          return { replacement: "" };
        }
        orderedBinds.push(p.name);
      }
      bindArgs = orderedBinds.join(", ");
    } else {
      bindArgs = binds.map((b) => b.name).join(", ");
    }

    const literal = "`" + normalisedSql.trim().replace(/`/g, "\\`") + "`";
    const prefix = fn.exported ? "export " : "";
    const async = fn.isAsync ? "async " : "";
    const body =
      callShape === "run"
        ? `{ const stmt = ${conn.name}.prepare(${literal}); stmt.run(${bindArgs}); }`
        : callShape === "all"
          ? `{ const stmt = ${conn.name}.prepare(${literal}); return stmt.all(${bindArgs}) as ${ret}; }`
          : `{ const stmt = ${conn.name}.prepare(${literal}); return stmt.get(${bindArgs}) as ${ret}; }`;
    const replacement = `${prefix}${async}function ${fn.name}${fn.signature} ${body}`;
    return { replacement };
  },
};

/**
 * Walk up the directory tree from `start` looking for `sql/${name}.sql`.
 * Stops at the filesystem root. Returns the absolute path or undefined.
 */
function findSqlFile(start: string, name: string): string | undefined {
  let dir = start;
  const { root } = parsePath(dir);
  while (true) {
    const candidate = join(dir, "sql", `${name}.sql`);
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Detect mutations by looking for a leading INSERT / UPDATE / DELETE /
 * REPLACE. A mutation that uses `RETURNING` is treated as a query
 * (queries the rows it just wrote), so the function returns the
 * resulting row(s).
 */
function isMutationSql(text: string): boolean {
  const head = text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .trim()
    .toUpperCase();
  const startsWithMutation = /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/.test(head);
  if (!startsWithMutation) return false;
  return !/\bRETURNING\b/.test(head);
}

// ----------------------------------------------------------------------------
// Event bus — `#[derive(Event)]` on the payload struct + `#[onEvent(Name)]`
// on listener functions. Each side emits a module-level descriptor;
// `bunny events` walks them to assemble a typed bus.
// ----------------------------------------------------------------------------

const deriveEvent: DeriveMacro = {
  kind: "derive",
  name: "Event",
  emit(ctx, { struct }) {
    // `#[derive(Event)]` is a marker — the struct type IS the payload
    // type, the listener side references it by name. No runtime const
    // needed; we only register the struct as an event so user macros
    // (or future tooling) can introspect it.
    ctx.appendToRecord(
      "events",
      JSON.stringify(struct.name),
      `{ name: ${JSON.stringify(struct.name)} }`,
      "object"
    );
    return "";
  },
};

const onEvent: FunctionAttrMacro = {
  kind: "function-attr",
  name: "onEvent",
  emit(ctx, { fn, attr }) {
    const eventName = attr.argList[0];
    if (!eventName) {
      ctx.error(`#[onEvent(...)] requires an event name`, attr.span);
      return { replacement: "" };
    }
    ctx.appendToRecord(
      "listeners",
      JSON.stringify(eventName),
      fn.name,
      "array"
    );
    return { replacement: "" };
  },
};

// ----------------------------------------------------------------------------
// `#[command("name", "description")]` — register a CLI command.
// ----------------------------------------------------------------------------

const command: FunctionAttrMacro = {
  kind: "function-attr",
  name: "command",
  emit(ctx, { fn, attr }) {
    const name = attr.argList[0] ?? fn.name;
    const description = attr.argList[1] ?? "";
    const params = parseFunctionParams(fn.params).map((p) => ({
      name: p.name,
      type: p.type,
    }));
    const meta = JSON.stringify({ description, params });
    ctx.appendToRecord(
      "commands",
      JSON.stringify(name),
      `{ ...${meta}, handler: ${fn.name} as (...args: any[]) => any }`,
      "object"
    );
    return { replacement: "" };
  },
};

const builtins: Macro[] = [
  minLength,
  maxLength,
  minimum,
  maximum,
  format,
  pattern,
  deriveClone,
  deriveEquals,
  deriveToJson,
  deriveDisplay,
  deriveDefault,
  deriveHash,
  ...routeMacros,
  sql,
  command,
  deriveEvent,
  onEvent,
];
