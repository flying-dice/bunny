import type { Product } from "../entities/Product.ts";
import type { ProductId } from "../types/ProductId.ts";

const products: Product[] = [];

export function list(): Product[] {
  return [...products];
}

export function find(id: ProductId): Product | undefined {
  return products.find((p) => p.id.value === id.value);
}

export function add(product: Product): void {
  products.push(product);
}
//# sourceMappingURL=InMemoryProductRepository.ts.map
