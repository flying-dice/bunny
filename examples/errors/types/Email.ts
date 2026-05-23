import "../bunny.runtime.ts";
// A constrained newtype around a string. Bunny emits both a throwing
// `Email.new(...)` and a Result-returning `Email.tryNew(...)`. The
// errors example uses `tryNew` so bad input doesn't crash.

export type Email = {
  readonly _struct?: "Email";
  value: string;
};
export const Email = {
  new(data: Omit<Email, "_struct">): Email {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value)) throw new Error("value must be a valid email address");
   return { ...data, _struct: "Email" }; },

  tryNew(data: Omit<Email, "_struct">): Result<Email, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value)) return Err({ field: "value", message: "value must be a valid email address" });
    return Ok({ ...data, _struct: "Email" } as Email);
  },
};
//# sourceMappingURL=Email.ts.map
