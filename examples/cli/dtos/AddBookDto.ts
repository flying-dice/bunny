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
import { Isbn } from "../types/Isbn.ts";

export type AddBookDto = {
  isbn: Isbn;
  title: string;
  author: string;
  copies: number;
};
export const AddBookDto = {
  new(data: AddBookDto): AddBookDto {
    data.isbn = Isbn.new(data.isbn);
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
    if (typeof data.author !== "string") throw new Error("author must be a string");
    if (data.author.length < 1) throw new Error("author must be at least 1 character");
    if (data.author.length > 100) throw new Error("author must be at most 100 characters");
    if (typeof data.copies !== "number" || Number.isNaN(data.copies)) throw new Error("copies must be a number");
    if (data.copies < 1) throw new Error("copies must be >= 1");
    if (data.copies > 1000) throw new Error("copies must be <= 1000");
   return data; },

  tryNew(data: AddBookDto): Result<AddBookDto, ConstraintError> {
    const __r_isbn = Isbn.tryNew(data.isbn);
    if (!__r_isbn.ok) return __r_isbn;
    data.isbn = __r_isbn.value;
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    if (typeof data.author !== "string") return Err({ field: "author", message: "author must be a string" });
    if (data.author.length < 1) return Err({ field: "author", message: "author must be at least 1 character" });
    if (data.author.length > 100) return Err({ field: "author", message: "author must be at most 100 characters" });
    if (typeof data.copies !== "number" || Number.isNaN(data.copies)) return Err({ field: "copies", message: "copies must be a number" });
    if (data.copies < 1) return Err({ field: "copies", message: "copies must be >= 1" });
    if (data.copies > 1000) return Err({ field: "copies", message: "copies must be <= 1000" });
    return Ok(data);
  },
};
//# sourceMappingURL=AddBookDto.ts.map
