import { afterAll, beforeAll, expect, test } from "bun:test";
import * as path from "node:path";
import { generateBun } from "./bun.ts";

const outDir = path.resolve(".tmp");
const appPath = path.join(outDir, "app.ts");
const routesPath = path.join(outDir, "routes.ts");
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(async () => {
  const { app, routes } = generateBun({
    sourceFiles: "examples/api/controllers/UsersController.ts",
    outDir,
  });
  await Bun.write(appPath, app);
  await Bun.write(routesPath, routes);
  const mod = await import(routesPath);
  server = Bun.serve({ port: 0, routes: mod.default });
  baseUrl = server.url.toString().replace(/\/$/, "");
});

afterAll(() => server.stop(true));

const fetchAt = (p: string, init?: globalThis.RequestInit) => fetch(baseUrl + p, init);

test("routes.ts exports a `handlers` object + default export; app.ts wires DI", async () => {
  const routesCode = await Bun.file(routesPath).text();
  expect(routesCode).toContain("export const handlers = {");
  expect(routesCode).toContain("export default handlers;");
  expect(routesCode).toContain('"/users/:id"');
  expect(routesCode).toContain('from "./app.ts"');

  const appCode = await Bun.file(appPath).text();
  expect(appCode).toContain("import { UsersController } from");
  expect(appCode).toContain("export const _usersController = new UsersController(");
});

test("GET with query passes validation and reaches the controller", async () => {
  const res = await fetchAt("/users?limit=1");
  expect(res.status).toBe(200);
  expect((await res.json()) as unknown[]).toHaveLength(1);
});

test("GET with Bun-extracted path params", async () => {
  const res = await fetchAt("/users/1");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: "1", name: "Ada" });
});

test("POST with JSON body — DI delivers the service", async () => {
  const res = await fetchAt("/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Linus", email: "l@example.com" }),
  });
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({ name: "Linus" });
});

test("DELETE returns 204", async () => {
  const res = await fetchAt("/users/1", { method: "DELETE" });
  expect(res.status).toBe(204);
});

test("invalid body returns 400 with source=request", async () => {
  const res = await fetchAt("/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Linus" }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as any;
  expect(body.source).toBe("request");
  expect(body.location).toBe("body");
});

test("handler exceptions return 500 with source=response", async () => {
  const ctrlModule = await import(path.resolve("examples/api/controllers/UsersController.ts"));
  const original = ctrlModule.UsersController.prototype.getUser;
  ctrlModule.UsersController.prototype.getUser = () => {
    throw new Error("boom in handler");
  };
  try {
    const fresh = await import(`${routesPath}?probe=${Date.now()}`);
    const s2 = Bun.serve({ port: 0, routes: fresh.default });
    try {
      const url = s2.url.toString().replace(/\/$/, "");
      const res = await fetch(`${url}/users/1`);
      expect(res.status).toBe(500);
      const body = (await res.json()) as any;
      expect(body.error).toBe("InternalServerError");
      expect(body.source).toBe("response");
      expect(body.reason).toBe("boom in handler");
    } finally {
      s2.stop(true);
    }
  } finally {
    ctrlModule.UsersController.prototype.getUser = original;
  }
});

test("handlers can be spread with extra user routes", async () => {
  const mod = await import(`${routesPath}?probe=spread-${Date.now()}`);
  const merged = {
    ...mod.default,
    "/health": () => new Response("ok"),
  };
  const s2 = Bun.serve({ port: 0, routes: merged });
  try {
    const url = s2.url.toString().replace(/\/$/, "");
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/users/1`)).status).toBe(200);
  } finally {
    s2.stop(true);
  }
});
