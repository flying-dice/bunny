import "../bunny.runtime.ts";
import { Isbn } from "../types/Isbn.ts";

export type AddBookDto = {
  readonly _struct?: "AddBookDto";
  isbn: Isbn;
  title: string;
  author: string;
  copies: number;
};
export const AddBookDto = {
  new(data: Omit<AddBookDto, "_struct">): AddBookDto {
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
   return { ...data, _struct: "AddBookDto" }; },

  tryNew(data: Omit<AddBookDto, "_struct">): Result<AddBookDto, ConstraintError> {
    const __r_isbn = Isbn.tryNew(data.isbn);
    if (!__r_isbn.ok) return __r_isbn;
    data.isbn = __r_isbn.value;
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    if (typeof data.author !== "string") return Err({ field: "author", message: "author must be a string" });
    if (data.author.length < 1) return Err({ field: "author", message: "author must be at least 1 character" });
    if (data.author.length > 100) return Err({ field: "author", message: "author must be at most 100 characters" });
    if (typeof data.copies !== "number" || Number.isNaN(data.copies)) return Err({ field: "copies", message: "copies must be a number" });
    if (data.copies < 1) return Err({ field: "copies", message: "copies must be >= 1" });
    if (data.copies > 1000) return Err({ field: "copies", message: "copies must be <= 1000" });
    return Ok({ ...data, _struct: "AddBookDto" } as AddBookDto);
  },
};
//# sourceMappingURL=AddBookDto.ts.map
