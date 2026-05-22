export interface CreateProductDto {
  /** @minLength 1 @maxLength 200 */
  name: string;
  /** @minimum 0 */
  priceCents: number;
  /** @minimum 0 */
  stock: number;
  tags?: string[];
}
