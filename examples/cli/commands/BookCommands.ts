import type { Book } from "../entities/Book.ts";
import { AddBookDto } from "../dtos/AddBookDto.ts";
import * as books from "../services/BookService.ts";

export function addBook(isbn: string, title: string, author: string, copies: number): void {
  // `#[deep]` on AddBookDto's `isbn` field chains through Isbn.new — so
  // we just pass the raw shape and trust AddBookDto.new to validate it.
  const dto = AddBookDto.new({
    isbn: { value: isbn },
    title,
    author,
    copies,
  });
  const book = books.addBook(dto);
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

export const __command_addBook: { name: string; description: string; params: { name: string; type: string }[]; handler: typeof addBook } = { ...{"name":"add","description":"Add a book to the library","params":[{"name":"isbn","type":"string"},{"name":"title","type":"string"},{"name":"author","type":"string"},{"name":"copies","type":"number"}]}, handler: addBook };
export const __command_listBooks: { name: string; description: string; params: { name: string; type: string }[]; handler: typeof listBooks } = { ...{"name":"list","description":"List every book on the shelf","params":[]}, handler: listBooks };
export const __command_findBook: { name: string; description: string; params: { name: string; type: string }[]; handler: typeof findBook } = { ...{"name":"find","description":"Find a book by id","params":[{"name":"id","type":"string"}]}, handler: findBook };
export const __command_statsCount: { name: string; description: string; params: { name: string; type: string }[]; handler: typeof statsCount } = { ...{"name":"stats:count","description":"Show the count of books on the shelf","params":[]}, handler: statsCount };
export const __command_statsAuthors: { name: string; description: string; params: { name: string; type: string }[]; handler: typeof statsAuthors } = { ...{"name":"stats:authors","description":"List unique authors","params":[]}, handler: statsAuthors };
//# sourceMappingURL=BookCommands.ts.map
