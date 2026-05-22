/**
 * Self-contained SSR example. React's `renderToReadableStream` produces
 * the HTML; Bun streams it.
 *
 *   bun run examples/ssr/server.ts
 *
 * Routes:
 *   GET  /          Home page (try `/?name=Ada`)
 *   GET  /about     About page
 *
 * Regenerate after editing any controller / component:
 *
 *   bun run example:ssr
 */
import routes from "./routes.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes,
});

console.log(`SSR → ${server.url}`);
