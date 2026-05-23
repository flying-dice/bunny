export type BookAdded = {
  id: string;
  title: string;
};
export const BookAdded = {
  new(data: BookAdded): BookAdded {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return data; },
};

export const __event_BookAdded: { name: "BookAdded" } = { name: "BookAdded" };
//# sourceMappingURL=BookAdded.ts.map
