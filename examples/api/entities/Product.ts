import type { ProductId } from "../types/ProductId.ts";

export interface Product {
  id: ProductId;
  /** @minLength 1 @maxLength 200 */
  name: string;
  /**
   * Price in cents to avoid float drift.
   * @minimum 0
   */
  priceCents: number;
  /** @minimum 0 */
  stock: number;
  /** @maxItems 10 */
  tags?: string[];
}
