import type { Database } from "bun:sqlite";
import type { Book } from "../entities/Book.ts";

export function insertBook(
  db: Database,
  id: string,
  title: string,
  author: string,
  copies: number,
): void { const stmt = db.prepare(`INSERT INTO books (id, title, author, copies)
VALUES (?, ?, ?, ?)`); stmt.run(id, title, author, copies); }

export function updateBookCopies(
  db: Database,
  id: string,
  copies: number,
): Book | undefined { const stmt = db.prepare(`UPDATE books
SET copies = ?
WHERE id = ?
RETURNING id, title, author, copies`); return stmt.get(copies, id) as Book | undefined; }
//# sourceMappingURL=BookMutations.ts.map
