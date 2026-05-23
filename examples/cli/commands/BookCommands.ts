import type { Book } from "../entities/Book.ts";
import { AddBookDto } from "../dtos/AddBookDto.ts";
import * as books from "../services/BookService.ts";

export function addBook(isbn: string, title: string, author: string, copies: number): void {
  // `AddBookDto.tryNew` returns a `Result<AddBookDto, ConstraintError>`
  // instead of throwing — and chains through `Isbn.tryNew` for the
  // deep-validated `isbn` field. Pattern-match the Result rather than
  // wrapping the call in try/catch.
  const parsed = AddBookDto.tryNew({
    isbn: { value: isbn },
    title,
    author,
    copies,
  });
  if (!parsed.ok) {
    console.error(`invalid input: ${parsed.error.field} — ${parsed.error.message}`);
    process.exit(2);
  }
  const book = books.addBook(parsed.value);
  console.log(`added ${book.id}  ${book.title} — ${book.author}  (${book.copies} copies)`);
}

export function listBooks(): void {
  const all = books.list();
  if (all.length === 0) {
    console.log("(no books)");
    return;
  }
  for (const b of all) {
    console.log(`${b.id}  ${b.title} — ${b.author}  (${b.copies} copies)`);
  }
}

export function findBook(id: string): void {
  const book = books.find(id);
  if (!book) {
    console.error("not found");
    process.exit(2);
  }
  console.log(JSON.stringify(book, null, 2));
}

export function statsCount(): void {
  console.log(books.list().length);
}

export function statsAuthors(): void {
  const seen = new Set(books.list().map((b) => b.author));
  for (const a of [...seen].sort()) console.log(a);
}

export const commands = {
  "add": { ...{"description":"Add a book to the library","params":[{"name":"isbn","type":"string"},{"name":"title","type":"string"},{"name":"author","type":"string"},{"name":"copies","type":"number"}]}, handler: addBook as (...args: any[]) => any },
  "list": { ...{"description":"List every book on the shelf","params":[]}, handler: listBooks as (...args: any[]) => any },
  "find": { ...{"description":"Find a book by id","params":[{"name":"id","type":"string"}]}, handler: findBook as (...args: any[]) => any },
  "stats:count": { ...{"description":"Show the count of books on the shelf","params":[]}, handler: statsCount as (...args: any[]) => any },
  "stats:authors": { ...{"description":"List unique authors","params":[]}, handler: statsAuthors as (...args: any[]) => any },
};
//# sourceMappingURL=BookCommands.ts.map
