#!/usr/bin/env bun
/**
 * Self-contained @sql demo. Compile + assemble with:
 *
 *   bun run example:sql
 *
 * which runs:
 *   bunny events -s '**\/*.tsb' -o bus.ts    # event bus from #[derive(Event)] + #[onEvent]
 *   (all .tsb files transpile to .ts during the events build above.)
 */
import { Database } from "bun:sqlite";
import { findBookById, listBooks } from "./repositories/BookQueries.ts";
import { insertBook, updateBookCopies } from "./repositories/BookMutations.ts";
import { emit } from "./bus.ts";

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
