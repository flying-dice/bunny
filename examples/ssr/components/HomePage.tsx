import { Layout } from "./Layout.tsx";

export function HomePage({ name, now }: { name: string; now: string }) {
  return (
    <Layout title="Home">
      <h1>Hello, {name}!</h1>
      <p>
        Rendered server-side at <code>{now}</code> using{" "}
        <a href="https://bun.com/docs/guides/ecosystem/ssr-react">
          React's <code>renderToReadableStream</code>
        </a>
        .
      </p>
      <p>
        Try <a href="/?name=Ada">/?name=Ada</a> to swap the greeting, browse the{" "}
        <a href="/posts">posts</a> served by an injected <code>@provides</code> service, or read the{" "}
        <a href="/about">about</a> page.
      </p>
    </Layout>
  );
}
