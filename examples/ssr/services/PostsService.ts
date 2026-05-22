import type { Post } from "../entities/Post.ts";

const POSTS: Post[] = [
  {
    id: "b8a1f44e-b1c8-4ac9-90c2-e6a8df5ebf01",
    title: "Hello, Bunny",
    body: "Bunny generates the routes, validators, and OpenAPI spec from your controllers — no decorators, just JSDoc.",
    publishedAt: "2025-02-01T09:00:00Z",
  },
  {
    id: "57f1e9a2-b39b-4f02-8a3a-1bfb6ad8c9a4",
    title: "Server-side rendering with Bun",
    body: "React's `renderToReadableStream` turns the JSX in a controller method into a streamed HTML response. Bun serves it without a build step.",
    publishedAt: "2025-02-08T11:30:00Z",
  },
  {
    id: "c41a3b97-8d23-4d6f-a91a-2e57c1b6df01",
    title: "Services and DI",
    body: "Classes tagged `@provides` are instantiated once at module load. `@inject` directives on a controller's constructor pull them in positionally — exactly what you'd write by hand, but generated.",
    publishedAt: "2025-02-15T14:15:00Z",
  },
];

/**
 * Read-only post store for the SSR demo. The whole point of this example is
 * that the data feeding the page comes from a `@provides PostsService`
 * singleton wired into the controller via constructor injection.
 *
 * @provides PostsService
 */
export class PostsService {
  list(): Post[] {
    return POSTS;
  }
  find(id: string): Post | undefined {
    return POSTS.find((p) => p.id === id);
  }
}
