#!/usr/bin/env bun
/**
 * CSR example — backend served from .tsb, React client served from
 * client/. Regenerate routes with:
 *
 *   bunny routes -s '**\/*.tsb' -o routes.ts
 */
import index from "./client/index.html";
import { routes as apiRoutes } from "./routes.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    ...apiRoutes,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`CSR → ${server.url}`);
