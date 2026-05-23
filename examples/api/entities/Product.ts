import "../bunny.runtime.ts";
import type { ProductId } from "../types/ProductId.ts";

export type Product = {
  readonly _struct?: "Product";
  id: ProductId;
  name: string;
  priceCents: number;
  stock: number;
};
export const Product = {
  new(data: Omit<Product, "_struct">): Product {
    if (typeof data.name !== "string") throw new Error("name must be a string");
    if (data.name.length < 1) throw new Error("name must be at least 1 character");
    if (data.name.length > 200) throw new Error("name must be at most 200 characters");
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) throw new Error("priceCents must be a number");
    if (data.priceCents < 0) throw new Error("priceCents must be >= 0");
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) throw new Error("stock must be a number");
    if (data.stock < 0) throw new Error("stock must be >= 0");
   return { ...data, _struct: "Product" }; },

  tryNew(data: Omit<Product, "_struct">): Result<Product, ConstraintError> {
    if (typeof data.name !== "string") return Err({ field: "name", message: "name must be a string" });
    if (data.name.length < 1) return Err({ field: "name", message: "name must be at least 1 character" });
    if (data.name.length > 200) return Err({ field: "name", message: "name must be at most 200 characters" });
    if (typeof data.priceCents !== "number" || Number.isNaN(data.priceCents)) return Err({ field: "priceCents", message: "priceCents must be a number" });
    if (data.priceCents < 0) return Err({ field: "priceCents", message: "priceCents must be >= 0" });
    if (typeof data.stock !== "number" || Number.isNaN(data.stock)) return Err({ field: "stock", message: "stock must be a number" });
    if (data.stock < 0) return Err({ field: "stock", message: "stock must be >= 0" });
    return Ok({ ...data, _struct: "Product" } as Product);
  },

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

  display(self: Product): string {
      return `${self.name} (${self.stock} in stock)`;
    },

  priceLabel(self: Product): string {
      return `${Product.display(self)} — see priceCents`;
    },
};
const __Product_satisfies_0: Display<Product> = Product; void __Product_satisfies_0;

// A user-declared trait. The `display` method is required; `priceLabel`
// has a default body that any `impl Display for X` inherits for free.
export interface Display<Self> {
  display(self: Self): string;
  priceLabel(self: Self): string;
}


//# sourceMappingURL=Product.ts.map
