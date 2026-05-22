import type { ProductId } from "../types/ProductId.ts";

/**
 * Tiny identity-generation service. Single-purpose, shared by anyone who
 * needs a fresh id.
 *
 * @provides IdService
 */
export class IdService {
  next(): ProductId {
    return crypto.randomUUID();
  }
}
