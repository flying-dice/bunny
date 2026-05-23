import "../bunny.runtime.ts";
export type BookAdded = {
  readonly _struct?: "BookAdded";
  id: string;
  title: string;
};
export const BookAdded = {
  new(data: Omit<BookAdded, "_struct">): BookAdded {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return { ...data, _struct: "BookAdded" }; },

  tryNew(data: Omit<BookAdded, "_struct">): Result<BookAdded, ConstraintError> {
    if (typeof data.id !== "string") return Err({ field: "id", message: "id must be a string" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) return Err({ field: "id", message: "id must be a valid UUID" });
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    return Ok({ ...data, _struct: "BookAdded" } as BookAdded);
  },
};

export const events = {
  "BookAdded": { name: "BookAdded" },
};
//# sourceMappingURL=BookAdded.ts.map
