/**
 * Self-contained CSR example. A React frontend (bundled by Bun via the
 * `index.html` import) talks to a Bunny app — the `@controller` /
 * `@provides` files in this same folder are compiled by `bunny` into the
 * `index.ts` we import below.
 *
 *   bun run example:csr        # regenerate handlers + spec
 *   bun --hot examples/csr/server.ts
 *
 * Routes:
 *   /api/todos               (GET, POST)
 *   /api/todos/:id           (DELETE)
 *   /api/todos/:id/toggle    (PATCH)
 *   /*                       React app shell (catch-all)
 */

import index from "./client/index.html";
import handlers from "./routes.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    ...handlers,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`CSR → ${server.url}`);
