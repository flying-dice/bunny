# SSR example

Server-side rendered pages — React on the server, no client JavaScript. Every page is a method on a Bunny `@controller`; the data those pages display comes from a `@provides`-tagged service injected via the constructor.

## Run

```bash
bun run example:ssr          # regenerate app.ts, routes.ts, openapi.json
bun run example:ssr:serve    # bun examples/ssr/server.ts
```

Open `http://localhost:3000`.

| Page         | Verb | What it does                                                                  |
| ------------ | ---- | ----------------------------------------------------------------------------- |
| `/`          | GET  | Greeting page. `?name=Ada` swaps the greeting (typed `query` on the request). |
| `/posts`     | GET  | Server-rendered list of posts, data from the injected `PostsService`.         |
| `/about`     | GET  | Static page explaining the setup.                                             |

`curl :3000/posts` — the HTML you see in the browser is the same HTML curl gets. Reload with JS disabled; the page still works.

## What it shows

- **React `renderToReadableStream` from a Bunny route**: a controller method returns `Promise<HtmlResponse>`. Bunny puts the route in `routes.ts`, Bun streams the result. See [Bun's SSR-React guide](https://bun.com/docs/guides/ecosystem/ssr-react) for the underlying primitive.
- **Data via injected service**: `PostsService` is `@provides PostsService`; `PagesController`'s constructor declares `@inject posts`. Bunny instantiates the service once in `app.ts` and passes it to the controller positionally — the controller never touches the data layer directly.
- **Typed query strings**: `home(req: TypedRequest<{ query: { name?: string } }>)` is enough — Bunny attaches a typed `req.query` for the handler and notes the parameter in the OpenAPI spec.
- **TSX inside a controller**: nothing special; the project's `tsconfig` already has `"jsx": "react-jsx"`. `.tsx` controllers and components live side-by-side with `.ts` services / entities.

## Layout

```
ssr/
├── controllers/
│   └── PagesController.tsx        (@controller — three routes, injects PostsService)
├── services/
│   └── PostsService.ts            (@provides PostsService — read-only post store)
├── entities/
│   └── Post.ts                    ({ id, title, body, publishedAt })
├── components/
│   ├── Layout.tsx                 (shared shell + nav)
│   ├── HomePage.tsx
│   ├── PostsPage.tsx              (renders the injected list)
│   └── AboutPage.tsx
├── app.ts                         (generated — DI wiring)
├── routes.ts                      (generated — handlers object)
├── openapi.json                   (generated)
└── server.ts                      (hand-written — Bun.serve)
```

## Compare with the CSR example

This is the same React, but the JS never leaves the server. View source on any page — it's complete HTML, no `<script src>` to a bundle. If you want the *client* to do the painting after fetching JSON, see `examples/csr/`.
