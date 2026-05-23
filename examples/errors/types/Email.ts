import "../bunny.runtime.ts";
// A constrained newtype around a string. Bunny emits both a throwing
// `Email.new(...)` and a Result-returning `Email.tryNew(...)`. The
// errors example uses `tryNew` so bad input doesn't crash.

export type Email = {
  value: string;
};
export const Email = {
  new(data: Email): Email {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value)) throw new Error("value must be a valid email address");
   return data; },

  tryNew(data: Email): Result<Email, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value)) return Err({ field: "value", message: "value must be a valid email address" });
    return Ok(data);
  },
};
//# sourceMappingURL=Email.ts.map
