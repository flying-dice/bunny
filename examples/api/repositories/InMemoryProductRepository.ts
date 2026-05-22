import type { Product } from "../entities/Product.ts";
import type { ProductId } from "../types/ProductId.ts";
import type { ProductRepository } from "./ProductRepository.ts";

/**
 * Array-backed implementation. Default impl — picked when no `--profile`
 * is passed (active profile is `"default"`).
 *
 * @provides ProductRepository
 * @profile default
 */
export class InMemoryProductRepository implements ProductRepository {
  private rows: Product[] = [];

  list(): Product[] {
    return this.rows;
  }

  find(id: ProductId): Product | undefined {
    return this.rows.find((p) => p.id === id);
  }

  add(product: Product): void {
    this.rows.push(product);
  }
}
