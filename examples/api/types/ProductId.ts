import "../bunny.runtime.ts";
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
