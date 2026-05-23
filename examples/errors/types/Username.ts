import "../bunny.runtime.ts";
export type Username = {
  readonly _struct?: "Username";
  value: string;
};
export const Username = {
  new(data: Omit<Username, "_struct">): Username {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (data.value.length < 3) throw new Error("value must be at least 3 characters");
    if (data.value.length > 20) throw new Error("value must be at most 20 characters");
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[a-zA-Z0-9_]+$/.test(data.value)) throw new Error("value must match ^[a-zA-Z0-9_]+$");
   return { ...data, _struct: "Username" }; },

  tryNew(data: Omit<Username, "_struct">): Result<Username, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (data.value.length < 3) return Err({ field: "value", message: "value must be at least 3 characters" });
    if (data.value.length > 20) return Err({ field: "value", message: "value must be at most 20 characters" });
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[a-zA-Z0-9_]+$/.test(data.value)) return Err({ field: "value", message: "value must match ^[a-zA-Z0-9_]+$" });
    return Ok({ ...data, _struct: "Username" } as Username);
  },
};
//# sourceMappingURL=Username.ts.map
