import "../bunny.runtime.ts";
export type Post = {
  readonly _struct?: "Post";
  id: string;
  title: string;
  body: string;
  publishedAt: string;
};
export const Post = {
  new(data: Omit<Post, "_struct">): Post {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
    if (typeof data.body !== "string") throw new Error("body must be a string");
    if (data.body.length < 1) throw new Error("body must be at least 1 character");
    if (typeof data.publishedAt !== "string") throw new Error("publishedAt must be a string");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(data.publishedAt)) throw new Error("publishedAt must be a valid ISO 8601 date-time");
   return { ...data, _struct: "Post" }; },

  tryNew(data: Omit<Post, "_struct">): Result<Post, ConstraintError> {
    if (typeof data.id !== "string") return Err({ field: "id", message: "id must be a string" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) return Err({ field: "id", message: "id must be a valid UUID" });
    if (typeof data.title !== "string") return Err({ field: "title", message: "title must be a string" });
    if (data.title.length < 1) return Err({ field: "title", message: "title must be at least 1 character" });
    if (data.title.length > 200) return Err({ field: "title", message: "title must be at most 200 characters" });
    if (typeof data.body !== "string") return Err({ field: "body", message: "body must be a string" });
    if (data.body.length < 1) return Err({ field: "body", message: "body must be at least 1 character" });
    if (typeof data.publishedAt !== "string") return Err({ field: "publishedAt", message: "publishedAt must be a string" });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(data.publishedAt)) return Err({ field: "publishedAt", message: "publishedAt must be a valid ISO 8601 date-time" });
    return Ok({ ...data, _struct: "Post" } as Post);
  },

  clone(self: Post): Post {
    return {
      id: self.id,
      title: self.title,
      body: self.body,
      publishedAt: self.publishedAt
    };
  },

  toJson(self: Post): string { return JSON.stringify(self); },
    
    fromJson(input: string): Post { return Post.new(JSON.parse(input) as Post); },
};
//# sourceMappingURL=Post.ts.map
