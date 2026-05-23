/**
 * SSR controllers stay as `.tsx` because they emit JSX. Each handler
 * returns a streamed HTML `Response`. They import the post list from
 * the `.tsb`-generated service module.
 *
 * Wired manually in `server.ts` — `bunny routes` doesn't currently
 * scan `.tsx` files for route macros.
 */
import { renderToReadableStream } from "react-dom/server";
import { AboutPage } from "../components/AboutPage.tsx";
import { HomePage } from "../components/HomePage.tsx";
import { PostsPage } from "../components/PostsPage.tsx";
import * as posts from "../services/PostsService.ts";

export async function home(req: Request): Promise<Response> {
  const name = new URL(req.url).searchParams.get("name") ?? "world";
  const stream = await renderToReadableStream(
    <HomePage name={name} now={new Date().toISOString()} />
  );
  return new Response(stream, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function listPosts(_req: Request): Promise<Response> {
  const stream = await renderToReadableStream(<PostsPage posts={posts.list()} />);
  return new Response(stream, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function about(_req: Request): Promise<Response> {
  const stream = await renderToReadableStream(<AboutPage />);
  return new Response(stream, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
