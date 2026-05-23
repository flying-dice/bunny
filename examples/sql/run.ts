#!/usr/bin/env bun
/**
 * Self-contained @sql + event-bus demo. Each listener module's compiled
 * `.ts` exports a `listeners` const built from its `#[onEvent(...)]`
 * macros. We merge them here and write a 6-line dispatcher in user
 * code — bunny doesn't generate a bus module.
 *
 *   bun run example:sql      # compile .tsb → .ts
 *   bun examples/sql/run.ts  # run the demo
 */
import { Database } from "bun:sqlite";
import { listeners as auditListeners } from "./listeners/AuditLog.ts";
import { insertBook, updateBookCopies } from "./repositories/BookMutations.ts";
import { findBookById, listBooks } from "./repositories/BookQueries.ts";

// ---- 6-line event bus, owned by user code ---------------------------------

const listeners: Record<string, ((payload: any) => unknown)[]> = {
  ...auditListeners,
};

async function emit<T>(event: string, payload: T): Promise<void> {
  for (const h of listeners[event] ?? []) await h(payload);
}

// ---- demo ----------------------------------------------------------------

const db = new Database(":memory:");
db.run(`
  CREATE TABLE books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    copies INTEGER NOT NULL
  )
`);

insertBook(db, "00000000-0000-0000-0000-000000000001", "Refactoring", "Martin Fowler", 3);
await emit("BookAdded", { id: "00000000-0000-0000-0000-000000000001", title: "Refactoring" });

insertBook(db, "00000000-0000-0000-0000-000000000002", "Domain-Driven Design", "Eric Evans", 1);
await emit("BookAdded", { id: "00000000-0000-0000-0000-000000000002", title: "Domain-Driven Design" });

console.log("--- list all (limit 10) ---");
console.log(listBooks(db, 10));

const book1 = "00000000-0000-0000-0000-000000000001";

console.log("--- find by id (1) ---");
console.log(findBookById(db, book1));

console.log("--- update copies (1 → 7) ---");
console.log(updateBookCopies(db, book1, 7));

console.log("--- find by id (missing) ---");
console.log(findBookById(db, "00000000-0000-0000-0000-000000000404"));
