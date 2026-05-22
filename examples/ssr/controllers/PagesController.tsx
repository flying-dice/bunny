import { renderToReadableStream } from "react-dom/server";
import type { HtmlResponse, TypedRequest } from "../../../src/index.ts";
import { AboutPage } from "../components/AboutPage.tsx";
import { HomePage } from "../components/HomePage.tsx";
import { PostsPage } from "../components/PostsPage.tsx";
import type { PostsService } from "../services/PostsService.ts";

/** @controller */
export class PagesController {
  /** @inject posts */
  constructor(private posts: PostsService) {}

  /**
   * Home page. `?name=Ada` swaps the greeting; everything else is static.
   *
   * @get /
   * @tag pages
   */
  async home(req: TypedRequest<{ query: { name?: string } }>): Promise<HtmlResponse> {
    const name = req.query.name ?? "world";
    const stream = await renderToReadableStream(
      <HomePage name={name} now={new Date().toISOString()} />
    );
    return new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  /**
   * Server-rendered list of posts. The data comes from a `PostsService`
   * singleton injected via the constructor — the controller never touches
   * the storage layer directly.
   *
   * @get /posts
   * @tag pages
   */
  async listPosts(_req: TypedRequest): Promise<HtmlResponse> {
    const stream = await renderToReadableStream(<PostsPage posts={this.posts.list()} />);
    return new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  /**
   * Static About page.
   *
   * @get /about
   * @tag pages
   */
  async about(_req: TypedRequest): Promise<HtmlResponse> {
    const stream = await renderToReadableStream(<AboutPage />);
    return new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}
