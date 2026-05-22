/**
 * Self-contained API example.
 *
 *   bun run examples/api/server.ts
 *
 * Routes:
 *   GET    /                Plain-text index of available routes.
 *   GET    /openapi.json    The spec Bunny generated from these controllers.
 *   GET    /users           List users
 *   GET    /users/:id       Fetch a user
 *   POST   /users           Create a user
 *   DELETE /users/:id       Delete a user
 *   POST   /users/xml       Accept an XML payload
 *   GET    /products        List products
 *   GET    /products/:id    Fetch a product
 *   POST   /products        Create a product
 *   GET    /health          Plain-text health check
 *
 * Regenerate after editing any controller / service / entity:
 *
 *   bun run example:api
 */
import routes from "./routes.ts";

const INDEX = [
  "Bunny API example — try:",
  "",
  "  GET  /users",
  "  GET  /users/1",
  '  POST /users           {"name":"…","email":"…@x.com"}',
  "  GET  /products",
  '  POST /products        {"name":"…","priceCents":1234,"stock":1}',
  "  GET  /health",
  "  GET  /openapi.json",
  "",
].join("\n");

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    // Bunny-generated handlers first…
    ...routes,
    // …mixed with whatever hand-written routes the app needs.
    "/": () => new Response(INDEX, { headers: { "content-type": "text/plain" } }),
    "/openapi.json": () => new Response(Bun.file(`${import.meta.dir}/openapi.json`)),
  },
});

console.log(`API → ${server.url}`);
