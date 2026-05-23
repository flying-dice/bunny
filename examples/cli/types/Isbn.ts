import "../bunny.runtime.ts";
// ISBN-13 wrapper. The pattern is checked at construction time via the
// generated `Isbn.new(...)` factory.

export type Isbn = {
  readonly _struct?: "Isbn";
  value: string;
};
export const Isbn = {
  new(data: Omit<Isbn, "_struct">): Isbn {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^(?:\d{13}|(?:\d{1,5}-){3}\d|(?:\d-){4}\d{4})$/.test(data.value)) throw new Error("value must match ^(?:\d{13}|(?:\d{1,5}-){3}\d|(?:\d-){4}\d{4})$");
   return { ...data, _struct: "Isbn" }; },

  tryNew(data: Omit<Isbn, "_struct">): Result<Isbn, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^(?:\d{13}|(?:\d{1,5}-){3}\d|(?:\d-){4}\d{4})$/.test(data.value)) return Err({ field: "value", message: "value must match ^(?:\\d{13}|(?:\\d{1,5}-){3}\\d|(?:\\d-){4}\\d{4})$" });
    return Ok({ ...data, _struct: "Isbn" } as Isbn);
  },
};
//# sourceMappingURL=Isbn.ts.map
