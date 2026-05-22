import * as path from "node:path";

/**
 * Compute a relative ESM import specifier from one file to another. Output
 * always uses POSIX separators, starts with `./` or `../`, and keeps the
 * `.ts` extension (this package targets Bun's TypeScript-aware loader and
 * `allowImportingTsExtensions`).
 */
export function relativeImport(fromFile: string, toFile: string): string {
  const fromDir = path.dirname(path.resolve(fromFile));
  let rel = path.relative(fromDir, path.resolve(toFile));
  rel = rel.split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

/**
 * A safe instance variable name for a generated controller binding. We
 * prepend `_` so it never collides with framework-conventional locals like
 * Hono's `c` (Context) or Bun's `req` (BunRequest).
 */
export function camelCase(s: string): string {
  if (!s) return s;
  return "_" + s[0]!.toLowerCase() + s.slice(1);
}

/** Emit a JS string literal. */
export function str(s: string): string {
  return JSON.stringify(s);
}

const VERBS_WITHOUT_BODY = new Set(["get", "head", "options"]);

export function hasBody(method: string): boolean {
  return !VERBS_WITHOUT_BODY.has(method);
}
