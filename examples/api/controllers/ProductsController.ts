import { CreateProductDto } from "../dtos/CreateProductDto.ts";
import type { Product } from "../entities/Product.ts";
import * as products from "../services/ProductService.ts";

export function listProducts(): Product[] {
  return products.list();
}

export function getProduct(id: string): Product | undefined {
  return products.find(id);
}

export function createProduct(body: CreateProductDto): Product {
  return products.create(CreateProductDto.new(body));
}

export const __route_listProducts: { method: "GET"; path: "/products"; params: { name: string; type: string }[]; handler: typeof listProducts } = { method: "GET", path: "/products", params: [], handler: listProducts };
export const __openapi_listProducts = {"operationId":"listProducts","method":"GET","path":"/products","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"array","items":{"$ref":"#/components/schemas/Product"}}}}}}} as const;
export const __route_getProduct: { method: "GET"; path: "/products/:id"; params: { name: string; type: string }[]; handler: typeof getProduct } = { method: "GET", path: "/products/:id", params: [{"name":"id","type":"string"}], handler: getProduct };
export const __openapi_getProduct = {"operationId":"getProduct","method":"GET","path":"/products/{id}","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{}}}}}} as const;
export const __route_createProduct: { method: "POST"; path: "/products"; params: { name: string; type: string }[]; handler: typeof createProduct } = { method: "POST", path: "/products", params: [{"name":"body","type":"CreateProductDto"}], handler: createProduct };
export const __openapi_createProduct = {"operationId":"createProduct","method":"POST","path":"/products","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Product"}}}}}} as const;
//# sourceMappingURL=ProductsController.ts.map
