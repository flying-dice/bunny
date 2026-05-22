/**
 * Normalize a route path: prepends `/` if missing, returns `/` for empty.
 */
export function normalizePath(p: string): string {
  if (!p) return "/";
  return p.startsWith("/") ? p : "/" + p;
}
