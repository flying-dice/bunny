#!/usr/bin/env bun
/**
 * SSR example. React's renderToReadableStream streams HTML; tsb owns
 * the entity/service layer. Controllers stay in `.tsx`.
 *
 *   bun run example:ssr            # compile .tsb → .ts
 *   bun examples/ssr/server.ts     # boot
 */
import { about, home, listPosts } from "./controllers/PagesController.tsx";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": { GET: home },
    "/posts": { GET: listPosts },
    "/about": { GET: about },
  },
});

console.log(`SSR → ${server.url}`);
