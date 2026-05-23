import "../bunny.runtime.ts";
export type Todo = {
  readonly _struct?: "Todo";
  id: string;
  title: string;
  done: boolean;
};
export const Todo = {
  new(data: Omit<Todo, "_struct">): Todo {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return { ...data, _struct: "Todo" }; },

  tryNew(data: Omit<Todo, "_struct">): Result<Todo, ConstraintError> {
    if (typeof data.id !== "string") return Err({ field: "id", message: "id must be a string" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) return Err({ field: "id", message: "id must be a valid UUID" });
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    return Ok({ ...data, _struct: "Todo" } as Todo);
  },

  clone(self: Todo): Todo {
    return {
      id: self.id,
      title: self.title,
      done: self.done
    };
  },

  equals(a: Todo, b: Todo): boolean {
    return a.id === b.id && a.title === b.title && a.done === b.done;
  },

  toJson(self: Todo): string { return JSON.stringify(self); },
    
    fromJson(input: string): Todo { return Todo.new(JSON.parse(input) as Todo); },
};
//# sourceMappingURL=Todo.ts.map
