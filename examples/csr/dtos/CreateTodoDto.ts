export type CreateTodoDto = {
  title: string;
};
export const CreateTodoDto = {
  new(data: CreateTodoDto): CreateTodoDto {
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
   return data; },
};
//# sourceMappingURL=CreateTodoDto.ts.map
