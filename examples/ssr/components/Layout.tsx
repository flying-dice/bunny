const STYLES = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { color: #c4451c; margin-bottom: 0.25rem; }
  h2 { color: #c4451c; }
  a { color: #c4451c; }
  code { background: rgba(0,0,0,.05); padding: 0.1em 0.3em; border-radius: 0.2em; }
  nav { margin: 0.25rem 0 1.5rem; opacity: 0.75; }
  nav a { margin-right: 1rem; }
  article { margin: 1.5rem 0; padding: 0.75rem 1rem; background: rgba(0,0,0,.04); border-radius: 0.4em; }
  article h3 { margin: 0 0 0.25rem; }
  article time { font-size: 0.85em; opacity: 0.6; }
`;

export function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title} · Bunny SSR</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/posts">Posts</a>
          <a href="/about">About</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
