import { Layout } from "./Layout.tsx";

export function AboutPage() {
  return (
    <Layout title="About">
      <h1>About</h1>
      <p>
        This site is an SSR demo for <code>bunny</code>. Every page is the return value of a method
        on a <code>PagesController</code> — Bunny reads the JSDoc on that controller, derives the
        routes, and emits a tiny <code>routes.ts</code> that wires the methods into{" "}
        <code>Bun.serve</code>.
      </p>
      <p>
        The <a href="/posts">posts</a> page reads its data from a <code>PostsService</code> marked{" "}
        <code>@provides PostsService</code>; the constructor's <code>@inject posts</code> directive
        tells Bunny to pass that singleton in positionally. The JSX itself is rendered by React's{" "}
        <a href="https://bun.com/docs/guides/ecosystem/ssr-react">
          <code>renderToReadableStream</code>
        </a>{" "}
        and streamed by Bun.
      </p>
      <p>
        No build step, no decorators — just <code>bun run example:ssr</code>.
      </p>
    </Layout>
  );
}
