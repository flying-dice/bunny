export type Book = {
  id: string;
  title: string;
  author: string;
  copies: number;
};
export const Book = {
  new(data: Book): Book {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
    if (typeof data.author !== "string") throw new Error("author must be a string");
    if (data.author.length < 1) throw new Error("author must be at least 1 character");
    if (data.author.length > 100) throw new Error("author must be at most 100 characters");
    if (typeof data.copies !== "number" || Number.isNaN(data.copies)) throw new Error("copies must be a number");
    if (data.copies < 0) throw new Error("copies must be >= 0");
   return data; },

  clone(self: Book): Book {
    return {
      id: self.id,
      title: self.title,
      author: self.author,
      copies: self.copies
    };
  },

  equals(a: Book, b: Book): boolean {
    return a.id === b.id && a.title === b.title && a.author === b.author && a.copies === b.copies;
  },

  toJson(self: Book): string { return JSON.stringify(self); },
    
    fromJson(input: string): Book { return Book.new(JSON.parse(input) as Book); },
};
//# sourceMappingURL=Book.ts.map
