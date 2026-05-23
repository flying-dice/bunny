#!/usr/bin/env bun
/**
 * Entry point. Bunny doesn't generate this — you write it once. Each
 * controller's compiled `.ts` exports a per-file `routes` and `openapi`
 * const built from its `#[get/post/...]` macros. Merge them here, hand
 * the result to `Bun.serve`, and write the OpenAPI doc next to it.
 *
 * Regenerate the controller `.ts` files after editing any `.tsb`:
 *
 *   bun run example:api
 */
import {
  openapi as productOpenapi,
  routes as productRoutes,
} from "./controllers/ProductsController.ts";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    ...productRoutes,
  },
});

await Bun.write(
  new URL("./openapi.json", import.meta.url),
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "Products API", version: "0.1.0" },
      paths: { ...productOpenapi },
    },
    null,
    2
  )
);

console.log(`api listening on http://localhost:${server.port}`);
