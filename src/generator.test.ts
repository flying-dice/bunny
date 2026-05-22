import { expect, test } from "bun:test";
import { generate } from "./index.ts";

const SPEC = generate({
  sourceFiles: "examples/api/controllers/UsersController.ts",
  base: { info: { title: "Users API", version: "0.1.0" } },
});

test("emits OpenAPI 3.1 envelope", () => {
  expect(SPEC.openapi).toBe("3.1.0");
  expect(SPEC.info.title).toBe("Users API");
});

test("collects routes from JSDoc tags using full paths", () => {
  expect(Object.keys(SPEC.paths ?? {}).sort()).toEqual([
    "/health",
    "/users",
    "/users/xml",
    "/users/{id}",
  ]);
});

test("TextResponse emits text/plain content", () => {
  const resp = SPEC.paths!["/health"]!.get!.responses!["200"] as any;
  expect(Object.keys(resp.content)).toEqual(["text/plain"]);
  expect(resp.content["text/plain"].schema).toEqual({ type: "string" });
});

test("TypedRequest with non-JSON content type sets requestBody media type", () => {
  const body = SPEC.paths!["/users/xml"]!.post!.requestBody as any;
  expect(Object.keys(body.content)).toEqual(["application/xml"]);
  expect(body.content["application/xml"].schema).toEqual({
    $ref: "#/components/schemas/CreateUserDto",
  });
});

test("union responses with same status merge content types", () => {
  const responses = SPEC.paths!["/users/xml"]!.post!.responses!;
  expect(Object.keys(responses)).toEqual(["200"]);
  const r = responses["200"] as any;
  expect(Object.keys(r.content).sort()).toEqual(["application/json", "application/xml"]);
});

test("alias forms (XmlRequest / XmlResponse / JsonResponse) are recognised", () => {
  // /users/xml uses XmlRequest + JsonResponse|XmlResponse
  const body = SPEC.paths!["/users/xml"]!.post!.requestBody as any;
  expect(Object.keys(body.content)).toEqual(["application/xml"]);
  const resp = SPEC.paths!["/users/xml"]!.post!.responses!["200"] as any;
  expect(Object.keys(resp.content).sort()).toEqual(["application/json", "application/xml"]);
});

test("operationId is the method name", () => {
  expect(SPEC.paths!["/users"]!.get!.operationId).toBe("listUsers");
  expect(SPEC.paths!["/users"]!.post!.operationId).toBe("createUser");
  expect(SPEC.paths!["/users/{id}"]!.get!.operationId).toBe("getUser");
  expect(SPEC.paths!["/users/{id}"]!.delete!.operationId).toBe("deleteUser");
});

test("@get/@post semantics map to HTTP verbs", () => {
  const root = SPEC.paths!["/users"]!;
  expect(Object.keys(root).sort()).toEqual(["get", "post"]);
  const byId = SPEC.paths!["/users/{id}"]!;
  expect(Object.keys(byId).sort()).toEqual(["delete", "get"]);
});

test("TypedRequest<{ params: ... }> produces path parameters", () => {
  const params = SPEC.paths!["/users/{id}"]!.get!.parameters as any[];
  expect(params).toEqual([
    expect.objectContaining({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string" },
    }),
  ]);
});

test("TypedRequest<{ query: ... }> produces query parameters with optional flag", () => {
  const params = SPEC.paths!["/users"]!.get!.parameters as any[];
  expect(params[0]).toMatchObject({
    name: "limit",
    in: "query",
    required: false,
  });
});

test("TypedRequest<{ body: ... }> builds requestBody with referenced schema", () => {
  const body = SPEC.paths!["/users"]!.post!.requestBody as any;
  expect(body.content["application/json"].schema).toEqual({
    $ref: "#/components/schemas/CreateUserDto",
  });
  expect(SPEC.components!.schemas!.CreateUserDto).toBeDefined();
});

test("TypedResponse<T> becomes the 200 response schema", () => {
  const resp = SPEC.paths!["/users/{id}"]!.get!.responses!["200"] as any;
  expect(resp.content["application/json"].schema).toEqual({
    $ref: "#/components/schemas/User",
  });
});

test("Promise<TypedResponse<T, 201>> is unwrapped and uses 201", () => {
  const responses = SPEC.paths!["/users"]!.post!.responses!;
  expect(Object.keys(responses)).toEqual(["201"]);
  const resp = responses["201"] as any;
  expect(resp.description).toBe("Created");
  expect(resp.content["application/json"].schema).toEqual({
    $ref: "#/components/schemas/User",
  });
});

test("TypedResponse<void, 204> emits a 204 No Content response", () => {
  const responses = SPEC.paths!["/users/{id}"]!.delete!.responses!;
  expect(Object.keys(responses)).toEqual(["204"]);
  const resp = responses["204"] as any;
  expect(resp.description).toBe("No Content");
  expect(resp.content).toBeUndefined();
});

test("union TypedResponse types produce one entry per status", () => {
  const responses = SPEC.paths!["/users/{id}"]!.get!.responses!;
  expect(Object.keys(responses).sort()).toEqual(["200", "404"]);
  expect((responses["404"] as any).description).toBe("Not Found");
  expect((responses["404"] as any).content["application/json"].schema).toMatchObject({
    type: "object",
    required: ["message"],
  });
});

test("JSDoc becomes operation summary", () => {
  expect(SPEC.paths!["/users"]!.get!.summary).toBe("List all users.");
});

test("@tag on a method is emitted as the operation's tags", () => {
  expect(SPEC.paths!["/users"]!.get!.tags).toEqual(["users"]);
  expect(SPEC.paths!["/health"]!.get!.tags).toEqual(["ops"]);
});

test("named object types are extracted into components", () => {
  const user = SPEC.components!.schemas!.User as any;
  expect(user.type).toBe("object");
  expect(user.required).toEqual(["id", "name", "email"]);
  expect(user.properties.age).toMatchObject({ type: "number" });
});

test("named type aliases hoist into components and are referenced by $ref", () => {
  // `/** @format uuid */ type Uuid = string;` → component "Uuid"
  expect(SPEC.components!.schemas!.Uuid).toMatchObject({
    type: "string",
    format: "uuid",
  });
  // `/** @format email */ type Email = string;` → component "Email"
  expect(SPEC.components!.schemas!.Email).toMatchObject({
    type: "string",
    format: "email",
  });
  // Properties using those aliases are pure refs.
  const user = SPEC.components!.schemas!.User as any;
  expect(user.properties.id).toEqual({ $ref: "#/components/schemas/Uuid" });
  expect(user.properties.email).toEqual({
    $ref: "#/components/schemas/Email",
  });
});

test("@format / @minLength / @minimum on properties flow into component schemas", () => {
  const user = SPEC.components!.schemas!.User as any;
  // Aliased properties are $refs to hoisted components.
  expect(user.properties.id).toEqual({ $ref: "#/components/schemas/Uuid" });
  expect(user.properties.email).toEqual({
    $ref: "#/components/schemas/Email",
  });
  // Inline-typed properties still carry their constraints directly.
  expect(user.properties.name).toMatchObject({
    type: "string",
    minLength: 1,
    maxLength: 100,
    description: "Display name.",
  });
  expect(user.properties.age).toMatchObject({
    type: "number",
    minimum: 0,
    maximum: 150,
  });
});
