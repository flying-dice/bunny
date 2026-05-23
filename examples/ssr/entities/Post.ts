export type Post = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
};
export const Post = {
  new(data: Post): Post {
    if (typeof data.id !== "string") throw new Error("id must be a string");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error("id must be a valid UUID");
    if (typeof data.title !== "string") throw new Error("title must be a string");
    if (data.title.length < 1) throw new Error("title must be at least 1 character");
    if (data.title.length > 200) throw new Error("title must be at most 200 characters");
    if (typeof data.body !== "string") throw new Error("body must be a string");
    if (data.body.length < 1) throw new Error("body must be at least 1 character");
    if (typeof data.publishedAt !== "string") throw new Error("publishedAt must be a string");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(data.publishedAt)) throw new Error("publishedAt must be a valid ISO 8601 date-time");
   return data; },

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
