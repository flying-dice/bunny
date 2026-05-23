import "../bunny.runtime.ts";
export type Username = {
  value: string;
};
export const Username = {
  new(data: Username): Username {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (data.value.length < 3) throw new Error("value must be at least 3 characters");
    if (data.value.length > 20) throw new Error("value must be at most 20 characters");
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[a-zA-Z0-9_]+$/.test(data.value)) throw new Error("value must match ^[a-zA-Z0-9_]+$");
   return data; },

  tryNew(data: Username): Result<Username, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (data.value.length < 3) return Err({ field: "value", message: "value must be at least 3 characters" });
    if (data.value.length > 20) return Err({ field: "value", message: "value must be at most 20 characters" });
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[a-zA-Z0-9_]+$/.test(data.value)) return Err({ field: "value", message: "value must match ^[a-zA-Z0-9_]+$" });
    return Ok(data);
  },
};
//# sourceMappingURL=Username.ts.map
