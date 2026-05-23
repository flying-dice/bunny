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
export type CreateProductDto = {
  name: string;
  priceCents: number;
  stock: number;
};
export const CreateProductDto = {
  new(data: CreateProductDto): CreateProductDto {
    if (typeof data.name !== "string") throw new Error("name must be a string");
    if (data.name.length < 1) throw new Error("name must be at least 1 character");
    if (data.name.length > 200) throw new Error("name must be at most 200 characters");
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) throw new Error("priceCents must be a number");
    if (data.priceCents < 0) throw new Error("priceCents must be >= 0");
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) throw new Error("stock must be a number");
    if (data.stock < 0) throw new Error("stock must be >= 0");
   return data; },

  tryNew(data: CreateProductDto): Result<CreateProductDto, ConstraintError> {
    if (typeof data.name !== "string") return Err({ field: "name", message: "name must be a string" });
    if (data.name.length < 1) return Err({ field: "name", message: "name must be at least 1 character" });
    if (data.name.length > 200) return Err({ field: "name", message: "name must be at most 200 characters" });
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) return Err({ field: "priceCents", message: "priceCents must be a number" });
    if (data.priceCents < 0) return Err({ field: "priceCents", message: "priceCents must be >= 0" });
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) return Err({ field: "stock", message: "stock must be a number" });
    if (data.stock < 0) return Err({ field: "stock", message: "stock must be >= 0" });
    return Ok(data);
  },
};
//# sourceMappingURL=CreateProductDto.ts.map
