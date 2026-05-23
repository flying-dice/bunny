// --- bunny: Result runtime (auto-injected) ---
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type ConstraintError = { field: string; message: string };
export function Ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
export function Err<E>(error: E): Result<never, E> { return { ok: false, error }; }
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } { return r.ok; }
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } { return !r.ok; }
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error));
}
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T { return r.ok ? r.value : fallback; }
export function mapResult<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? Ok(fn(r.value)) : r;
}
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : Err(fn(r.error));
}
export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}
// --- end Result runtime ---
export type ProductId = {
  value: string;
};
export const ProductId = {
  new(data: ProductId): ProductId {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.value)) throw new Error("value must be a valid UUID");
   return data; },

  tryNew(data: ProductId): Result<ProductId, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.value)) return Err({ field: "value", message: "value must be a valid UUID" });
    return Ok(data);
  },
};
//# sourceMappingURL=ProductId.ts.map
