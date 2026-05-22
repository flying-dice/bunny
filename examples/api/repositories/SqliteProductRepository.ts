import { Database } from "bun:sqlite";
import type { Product } from "../entities/Product.ts";
import type { ProductId } from "../types/ProductId.ts";
import type { ProductRepository } from "./ProductRepository.ts";

interface Row {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  tags: string | null;
}

/**
 * SQLite-backed implementation using Bun's built-in `bun:sqlite`. Picked
 * under `--profile production`. Uses an in-memory database for the demo,
 * but the same class would point at a real file path in a real app.
 *
 * @provides ProductRepository
 * @profile production
 */
export class SqliteProductRepository implements ProductRepository {
  private db = new Database(":memory:");

  constructor() {
    this.db.run(
      `CREATE TABLE products (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        priceCents INTEGER NOT NULL,
        stock      INTEGER NOT NULL,
        tags       TEXT
      )`
    );
  }

  list(): Product[] {
    return this.db
      .query<Row, []>("SELECT id, name, priceCents, stock, tags FROM products")
      .all()
      .map(rowToProduct);
  }

  find(id: ProductId): Product | undefined {
    const row = this.db
      .query<Row, [string]>("SELECT id, name, priceCents, stock, tags FROM products WHERE id = ?")
      .get(id);
    return row ? rowToProduct(row) : undefined;
  }

  add(product: Product): void {
    this.db.run("INSERT INTO products (id, name, priceCents, stock, tags) VALUES (?, ?, ?, ?, ?)", [
      product.id,
      product.name,
      product.priceCents,
      product.stock,
      product.tags ? JSON.stringify(product.tags) : null,
    ]);
  }
}

function rowToProduct(row: Row): Product {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    stock: row.stock,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
  };
}
