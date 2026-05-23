import "../bunny.runtime.ts";
export type CreateProductDto = {
  readonly _struct?: "CreateProductDto";
  name: string;
  priceCents: number;
  stock: number;
};
export const CreateProductDto = {
  new(data: Omit<CreateProductDto, "_struct">): CreateProductDto {
    if (typeof data.name !== "string") throw new Error("name must be a string");
    if (data.name.length < 1) throw new Error("name must be at least 1 character");
    if (data.name.length > 200) throw new Error("name must be at most 200 characters");
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) throw new Error("priceCents must be a number");
    if (data.priceCents < 0) throw new Error("priceCents must be >= 0");
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) throw new Error("stock must be a number");
    if (data.stock < 0) throw new Error("stock must be >= 0");
   return { ...data, _struct: "CreateProductDto" }; },

  tryNew(data: Omit<CreateProductDto, "_struct">): Result<CreateProductDto, ConstraintError> {
    if (typeof data.name !== "string") return Err({ field: "name", message: "name must be a string" });
    if (data.name.length < 1) return Err({ field: "name", message: "name must be at least 1 character" });
    if (data.name.length > 200) return Err({ field: "name", message: "name must be at most 200 characters" });
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) return Err({ field: "priceCents", message: "priceCents must be a number" });
    if (data.priceCents < 0) return Err({ field: "priceCents", message: "priceCents must be >= 0" });
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) return Err({ field: "stock", message: "stock must be a number" });
    if (data.stock < 0) return Err({ field: "stock", message: "stock must be >= 0" });
    return Ok({ ...data, _struct: "CreateProductDto" } as CreateProductDto);
  },
};
//# sourceMappingURL=CreateProductDto.ts.map
