import "../bunny.runtime.ts";
export type ProductId = {
  readonly _struct?: "ProductId";
  value: string;
};
export const ProductId = {
  new(data: Omit<ProductId, "_struct">): ProductId {
    if (typeof data.value !== "string") throw new Error("value must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.value)) throw new Error("value must be a valid UUID");
   return { ...data, _struct: "ProductId" }; },

  tryNew(data: Omit<ProductId, "_struct">): Result<ProductId, ConstraintError> {
    if (typeof data.value !== "string") return Err({ field: "value", message: "value must be a string" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.value)) return Err({ field: "value", message: "value must be a valid UUID" });
    return Ok({ ...data, _struct: "ProductId" } as ProductId);
  },
};
//# sourceMappingURL=ProductId.ts.map
