import type { JsonResponse, TypedRequest, TypedResponse } from "../../../src/index.ts";
import type { CreateProductDto } from "../dtos/CreateProductDto.ts";
import type { Product } from "../entities/Product.ts";
import type { ProductService } from "../services/ProductService.ts";
import type { ProductId } from "../types/ProductId.ts";

/** @controller */
export class ProductsController {
  /** @inject products */
  constructor(private products: ProductService) {}

  /**
   * List every product.
   * @get /products
   * @tag products
   */
  listProducts(_req: TypedRequest): JsonResponse<Product[]> {
    return Response.json(this.products.list());
  }

  /**
   * Fetch a single product by id.
   * @get /products/:id
   * @tag products
   */
  getProduct(
    req: TypedRequest<{ params: { id: ProductId } }>
  ): TypedResponse<Product> | TypedResponse<{ message: string }, 404> {
    const p = this.products.find(req.params.id);
    if (!p) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(p);
  }

  /**
   * Create a product.
   * @post /products
   * @tag products
   */
  async createProduct(
    req: TypedRequest<{ body: CreateProductDto }>
  ): Promise<TypedResponse<Product, 201>> {
    const dto = await req.json();
    return Response.json(this.products.create(dto), { status: 201 });
  }
}
