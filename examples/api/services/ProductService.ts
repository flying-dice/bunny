import type { CreateProductDto } from "../dtos/CreateProductDto.ts";
import type { Product } from "../entities/Product.ts";
import type { ProductRepository } from "../repositories/ProductRepository.ts";
import type { ProductId } from "../types/ProductId.ts";
import type { IdService } from "./IdService.ts";

/**
 * Business logic. Depends on the `ProductRepository` *interface* — Bunny
 * picks the concrete `@provides ProductRepository` whose `@profile` matches
 * the active profile when `app.ts` is generated.
 *
 * @provides ProductService
 */
export class ProductService {
  /**
   * @inject repo
   * @inject ids
   */
  constructor(
    private repo: ProductRepository,
    private ids: IdService
  ) {}

  list(): Product[] {
    return this.repo.list();
  }
  find(id: ProductId): Product | undefined {
    return this.repo.find(id);
  }
  create(dto: CreateProductDto): Product {
    const p: Product = { id: this.ids.next(), ...dto };
    this.repo.add(p);
    return p;
  }
}
