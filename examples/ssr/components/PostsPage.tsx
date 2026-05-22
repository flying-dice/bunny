import type { Post } from "../entities/Post.ts";
import { Layout } from "./Layout.tsx";

const FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function PostsPage({ posts }: { posts: Post[] }) {
  return (
    <Layout title="Posts">
      <h1>Posts</h1>
      <p>
        The list below comes from a <code>PostsService</code> injected into the controller — see{" "}
        <code>examples/ssr/services/PostsService.ts</code>. The page is rendered server-side and
        streamed by Bun.
      </p>
      {posts.map((post) => (
        <article key={post.id}>
          <h3>{post.title}</h3>
          <time dateTime={post.publishedAt}>{FORMATTER.format(new Date(post.publishedAt))}</time>
          <p>{post.body}</p>
        </article>
      ))}
    </Layout>
  );
}
