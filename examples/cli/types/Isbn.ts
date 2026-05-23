// ISBN-13 wrapper. The pattern is checked at construction time via the
// generated `Isbn.new(...)` factory.

export type Isbn = {
  value: string;
};
export const Isbn = {
  new(data: Isbn): Isbn {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^(?:\d{13}|(?:\d{1,5}-){3}\d|(?:\d-){4}\d{4})$/.test(data.value)) throw new Error("value must match ^(?:\d{13}|(?:\d{1,5}-){3}\d|(?:\d-){4}\d{4})$");
   return data; },
};
//# sourceMappingURL=Isbn.ts.map
