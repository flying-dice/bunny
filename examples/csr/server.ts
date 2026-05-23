#!/usr/bin/env bun
/**
 * CSR example. Each controller's compiled `.ts` exports a per-file
 * `routes` const built from its `#[get/post/...]` macros. Merge them
 * here, hand the result to `Bun.serve`. The React client is served
 * alongside via Bun's HTML import.
 *
 *   bun run example:csr      # compile .tsb → .ts
 *   bun --hot examples/csr/server.ts
 */
import index from "./client/index.html";
import { routes as todosRoutes } from "./controllers/TodosController.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    ...todosRoutes,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`CSR → ${server.url}`);
