import "../bunny.runtime.ts";
export type CreateTodoDto = {
  title: string;
};
export const CreateTodoDto = {
  new(data: CreateTodoDto): CreateTodoDto {
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return data; },

  tryNew(data: CreateTodoDto): Result<CreateTodoDto, ConstraintError> {
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    return Ok(data);
  },
};
//# sourceMappingURL=CreateTodoDto.ts.map
