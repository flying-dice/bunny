import type { ProductId } from "../types/ProductId.ts";

export type Product = {
  id: ProductId;
  name: string;
  priceCents: number;
  stock: number;
};
export const Product = {
  new(data: Product): Product {
    if (typeof data.name !== "string") throw new Error("name must be a string");
    if (data.name.length < 1) throw new Error("name must be at least 1 character");
    if (data.name.length > 200) throw new Error("name must be at most 200 characters");
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) throw new Error("priceCents must be a number");
    if (data.priceCents < 0) throw new Error("priceCents must be >= 0");
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) throw new Error("stock must be a number");
    if (data.stock < 0) throw new Error("stock must be >= 0");
   return data; },

  clone(self: Product): Product {
    return {
      id: self.id,
      name: self.name,
      priceCents: self.priceCents,
      stock: self.stock
    };
  },

  equals(a: Product, b: Product): boolean {
    return a.id === b.id && a.name === b.name && a.priceCents === b.priceCents && a.stock === b.stock;
  },

  toJson(self: Product): string { return JSON.stringify(self); },
    
    fromJson(input: string): Product { return Product.new(JSON.parse(input) as Product); },
};
//# sourceMappingURL=Product.ts.map
