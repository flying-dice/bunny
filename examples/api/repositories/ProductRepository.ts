import type { Product } from "../entities/Product.ts";
import type { ProductId } from "../types/ProductId.ts";

/**
 * Storage contract for products. `ProductService` consumes this interface;
 * concrete implementations declare themselves with `@provides
 * ProductRepository` and Bunny picks the one whose `@profile` matches the
 * active profile.
 */
export interface ProductRepository {
  list(): Product[];
  find(id: ProductId): Product | undefined;
  add(product: Product): void;
}
