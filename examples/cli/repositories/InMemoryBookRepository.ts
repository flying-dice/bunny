// In-memory storage for books. Module-level state replaces the old
// class-with-private-field pattern — tsb doesn't have classes, and a
// CLI process is short-lived enough that a singleton is fine.

import type { Book } from "../entities/Book.ts";

const books: Book[] = [];

export function list(): Book[] {
  return [...books];
}

export function find(id: string): Book | undefined {
  return books.find((b) => b.id === id);
}

export function add(book: Book): void {
  books.push(book);
}
//# sourceMappingURL=InMemoryBookRepository.ts.map
