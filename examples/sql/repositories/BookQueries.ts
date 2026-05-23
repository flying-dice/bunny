import type { Database } from "bun:sqlite";
import type { Book } from "../entities/Book.ts";

export function findBookById(db: Database, id: string): Book | undefined { const stmt = db.prepare(`SELECT id, title, author, copies
FROM books
WHERE id = ?
LIMIT 1`); return stmt.get(id) as Book | undefined; }

export function listBooks(db: Database, limit: number): Book[] { const stmt = db.prepare(`SELECT id, title, author, copies
FROM books
ORDER BY title
LIMIT ?`); return stmt.all(limit) as Book[]; }
//# sourceMappingURL=BookQueries.ts.map
