import "../bunny.runtime.ts";
export type CreateTodoDto = {
  readonly _struct?: "CreateTodoDto";
  title: string;
};
export const CreateTodoDto = {
  new(data: Omit<CreateTodoDto, "_struct">): CreateTodoDto {
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return { ...data, _struct: "CreateTodoDto" }; },

  tryNew(data: Omit<CreateTodoDto, "_struct">): Result<CreateTodoDto, ConstraintError> {
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    return Ok({ ...data, _struct: "CreateTodoDto" } as CreateTodoDto);
  },
};
//# sourceMappingURL=CreateTodoDto.ts.map
