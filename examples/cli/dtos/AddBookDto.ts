import { Isbn } from "../types/Isbn.ts";

export type AddBookDto = {
  isbn: Isbn;
  title: string;
  author: string;
  copies: number;
};
export const AddBookDto = {
  new(data: AddBookDto): AddBookDto {
    data.isbn = Isbn.new(data.isbn);
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
    if (typeof data.author !== "string") throw new Error("author must be a string");
    if (data.author.length < 1) throw new Error("author must be at least 1 character");
    if (data.author.length > 100) throw new Error("author must be at most 100 characters");
    if (typeof data.copies !== "number" || Number.isNaN(data.copies)) throw new Error("copies must be a number");
    if (data.copies < 1) throw new Error("copies must be >= 1");
    if (data.copies > 1000) throw new Error("copies must be <= 1000");
   return data; },
};
//# sourceMappingURL=AddBookDto.ts.map
