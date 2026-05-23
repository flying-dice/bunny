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

export const routes = {
  "/products": { ...{ GET: (req: Request) => Response.json(listProducts()) }, ...{ POST: async (req: Request) => { const body = await req.json(); return Response.json(createProduct((body as any))); } } },
  "/products/:id": { GET: (req: Request) => Response.json(getProduct((req as any).params?.id)) },
};

export const openapi = {
  "/products": { ...{ get: {"operationId":"listProducts","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"array","items":{"$ref":"#/components/schemas/Product"}}}}}}} as const }, ...{ post: {"operationId":"createProduct","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Product"}}}}}} as const } },
  "/products/{id}": { get: {"operationId":"getProduct","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{}}}}}} as const },
};

export const client = {
  listProducts: async (): Promise<Awaited<ReturnType<typeof listProducts>>> => {
      const __res = await fetch("/products", { method: "GET" });
      if (!__res.ok) throw new Error(`${"GET"} ${"/products"} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof listProducts>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof listProducts>>;
    },
  getProduct: async (id: Parameters<typeof getProduct>[0]): Promise<Awaited<ReturnType<typeof getProduct>>> => {
      const __res = await fetch(`/products/${encodeURIComponent(String(id))}`, { method: "GET" });
      if (!__res.ok) throw new Error(`${"GET"} ${`/products/${encodeURIComponent(String(id))}`} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof getProduct>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof getProduct>>;
    },
  createProduct: async (body: Parameters<typeof createProduct>[0]): Promise<Awaited<ReturnType<typeof createProduct>>> => {
      const __res = await fetch("/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!__res.ok) throw new Error(`${"POST"} ${"/products"} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof createProduct>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof createProduct>>;
    },
};
//# sourceMappingURL=ProductsController.ts.map
