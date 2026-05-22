import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { generateBun } from "./bun.ts";
import { generate } from "./generator.ts";

const TMP = path.resolve(".tmp/vocab");

// Servers spun up by `compile()` get stopped at the end of the suite so each
// test stays cheap; we never leak ports.
const _servers: Array<{ stop: (force?: boolean) => Promise<void> }> = [];
afterAll(async () => {
  await Promise.all(_servers.map((s) => s.stop(true)));
  _servers.length = 0;
});

/**
 * Compile an inline fixture, spin up `Bun.serve({ routes })` against the
 * generated handlers, and return the OpenAPI spec plus a `request()` helper
 * that hits the live server. Tests exercise the public entry points
 * (`generate`, `generateBun`) and assert on behaviour — never emitted source.
 */
async function compile(name: string, source: string) {
  const outDir = path.resolve(TMP, name);
  const controllerPath = path.join(outDir, "controller.ts");
  const appPath = path.join(outDir, "app.ts");
  const routesPath = path.join(outDir, "routes.ts");

  await Bun.write(controllerPath, source);

  const spec = generate({ sourceFiles: controllerPath });
  const { app, routes } = generateBun({ sourceFiles: controllerPath, outDir });
  await Bun.write(appPath, app);
  await Bun.write(routesPath, routes);

  const mod = await import(`${routesPath}?v=${Date.now()}`);
  const server = Bun.serve({ port: 0, routes: mod.default });
  _servers.push(server);
  const baseUrl = server.url.toString().replace(/\/$/, "");

  const request = (input: string, init?: RequestInit) => fetch(baseUrl + input, init);
  return { spec, request };
}

const PRELUDE = `import type {
  TypedRequest,
  TypedResponse,
  JsonResponse,
} from "${path.resolve("src/index.ts")}";
`;

// ---------------------------------------------------------------------------
// Schema generation — basic OpenAPI vocabulary
// ---------------------------------------------------------------------------

describe("primitive types", () => {
  test("string / number / boolean / null appear with correct OpenAPI types", async () => {
    const { spec } = await compile(
      "primitives",
      `${PRELUDE}
interface Payload {
  s: string;
  n: number;
  b: boolean;
  z: null;
}
/** @controller */
export class C {
  /** @post /p */
  m(req: TypedRequest<{ body: Payload }>): JsonResponse<Payload> {
    return Response.json({ s: "", n: 0, b: false, z: null });
  }
}
`
    );
    const props = (spec.components!.schemas!.Payload as any).properties;
    expect(props.s).toMatchObject({ type: "string" });
    expect(props.n).toMatchObject({ type: "number" });
    expect(props.b).toMatchObject({ type: "boolean" });
    expect(props.z).toMatchObject({ type: "null" });
  });
});

describe("optional vs required", () => {
  test("optional properties are excluded from `required`", async () => {
    const { spec } = await compile(
      "optional",
      `${PRELUDE}
interface Maybe { a: string; b?: number }
/** @controller */
export class C {
  /** @post /m */
  m(req: TypedRequest<{ body: Maybe }>): JsonResponse<Maybe> {
    return Response.json({ a: "" });
  }
}
`
    );
    const s = spec.components!.schemas!.Maybe as any;
    expect(s.required).toEqual(["a"]);
  });
});

describe("literal & enum types", () => {
  test("string literal union becomes oneOf of single-value enums", async () => {
    const { spec } = await compile(
      "literals",
      `${PRELUDE}
interface Choice { mode: "fast" | "safe" | "off" }
/** @controller */
export class C {
  /** @post /c */
  m(req: TypedRequest<{ body: Choice }>): JsonResponse<Choice> {
    return Response.json({ mode: "fast" });
  }
}
`
    );
    const mode = (spec.components!.schemas!.Choice as any).properties.mode;
    // We currently emit a oneOf of enum-singletons; alternative spec output
    // shapes (single `enum`) are also valid.
    if (mode.oneOf) {
      expect(mode.oneOf.map((v: any) => v.enum?.[0]).sort()).toEqual(["fast", "off", "safe"]);
    } else {
      expect(mode.enum?.sort()).toEqual(["fast", "off", "safe"]);
    }
  });
});

describe("nested objects and arrays", () => {
  test("array of primitives produces `type: array, items: {...}`", async () => {
    const { spec } = await compile(
      "arr-prim",
      `${PRELUDE}
interface Tags { tags: string[] }
/** @controller */
export class C {
  /** @post /t */
  m(req: TypedRequest<{ body: Tags }>): JsonResponse<Tags> {
    return Response.json({ tags: [] });
  }
}
`
    );
    expect((spec.components!.schemas!.Tags as any).properties.tags).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });

  test("array of named types produces `items: { $ref: ... }`", async () => {
    const { spec } = await compile(
      "arr-named",
      `${PRELUDE}
interface Item { id: string }
interface Bag { items: Item[] }
/** @controller */
export class C {
  /** @post /b */
  m(req: TypedRequest<{ body: Bag }>): JsonResponse<Bag> {
    return Response.json({ items: [] });
  }
}
`
    );
    const bag = spec.components!.schemas!.Bag as any;
    expect(bag.properties.items).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/Item" },
    });
    expect(spec.components!.schemas!.Item).toBeDefined();
  });

  test("nested objects via $ref to components", async () => {
    const { spec } = await compile(
      "nested",
      `${PRELUDE}
interface Address { street: string }
interface Person { name: string; address: Address }
/** @controller */
export class C {
  /** @post /p */
  m(req: TypedRequest<{ body: Person }>): JsonResponse<Person> {
    return Response.json({ name: "", address: { street: "" } });
  }
}
`
    );
    const person = spec.components!.schemas!.Person as any;
    expect(person.properties.address).toEqual({
      $ref: "#/components/schemas/Address",
    });
  });
});

describe("constraint vocabulary in the spec", () => {
  test("string constraints (format / minLength / maxLength / pattern)", async () => {
    const { spec } = await compile(
      "string-constraints",
      `${PRELUDE}
interface S {
  /** @format uuid */
  id: string;
  /** @minLength 1 @maxLength 10 */
  short: string;
  /** @pattern ^[A-Z]+$ */
  caps: string;
}
/** @controller */
export class C {
  /** @post /s */
  m(req: TypedRequest<{ body: S }>): JsonResponse<S> {
    return Response.json({ id: "", short: "", caps: "" });
  }
}
`
    );
    const s = (spec.components!.schemas!.S as any).properties;
    expect(s.id).toMatchObject({ type: "string", format: "uuid" });
    expect(s.short).toMatchObject({ type: "string", minLength: 1, maxLength: 10 });
    expect(s.caps).toMatchObject({ type: "string", pattern: "^[A-Z]+$" });
  });

  test("number constraints (minimum / maximum / exclusive / multipleOf)", async () => {
    const { spec } = await compile(
      "num-constraints",
      `${PRELUDE}
interface N {
  /** @minimum 0 @maximum 100 */
  pct: number;
  /** @exclusiveMinimum 0 @exclusiveMaximum 1 */
  prob: number;
  /** @multipleOf 5 */
  step: number;
}
/** @controller */
export class C {
  /** @post /n */
  m(req: TypedRequest<{ body: N }>): JsonResponse<N> {
    return Response.json({ pct: 0, prob: 0.5, step: 0 });
  }
}
`
    );
    const n = (spec.components!.schemas!.N as any).properties;
    expect(n.pct).toMatchObject({ minimum: 0, maximum: 100 });
    expect(n.prob).toMatchObject({ exclusiveMinimum: 0, exclusiveMaximum: 1 });
    expect(n.step).toMatchObject({ multipleOf: 5 });
  });

  test("array constraints (minItems / maxItems / uniqueItems)", async () => {
    const { spec } = await compile(
      "arr-constraints",
      `${PRELUDE}
interface A {
  /** @minItems 1 @maxItems 5 @uniqueItems */
  tags: string[];
}
/** @controller */
export class C {
  /** @post /a */
  m(req: TypedRequest<{ body: A }>): JsonResponse<A> {
    return Response.json({ tags: [] });
  }
}
`
    );
    const a = (spec.components!.schemas!.A as any).properties.tags;
    expect(a).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
    });
  });

  test("metadata: @default / @example / @deprecated / @title / @description", async () => {
    const { spec } = await compile(
      "metadata",
      `${PRELUDE}
interface M {
  /**
   * The user's full name.
   * @example "Ada Lovelace"
   * @default "anon"
   */
  name: string;
  /** @deprecated */
  legacy?: string;
  /** @title HostPort */
  hp: string;
}
/** @controller */
export class C {
  /** @post /m */
  m(req: TypedRequest<{ body: M }>): JsonResponse<M> {
    return Response.json({ name: "", hp: "" });
  }
}
`
    );
    const props = (spec.components!.schemas!.M as any).properties;
    expect(props.name).toMatchObject({
      description: "The user's full name.",
      example: "Ada Lovelace",
      default: "anon",
    });
    expect(props.legacy).toMatchObject({ deprecated: true });
    expect(props.hp).toMatchObject({ title: "HostPort" });
  });
});

describe("type aliases hoist into components", () => {
  test("aliases of primitives become components and are referenced by $ref", async () => {
    const { spec } = await compile(
      "alias-1",
      `${PRELUDE}
/** @format email */
type Email = string;
interface U { contact: Email }
/** @controller */
export class C {
  /** @post /u */
  m(req: TypedRequest<{ body: U }>): JsonResponse<U> {
    return Response.json({ contact: "" });
  }
}
`
    );
    // The alias is hoisted into components with its JSDoc constraints baked in.
    expect(spec.components!.schemas!.Email).toMatchObject({
      type: "string",
      format: "email",
    });
    // Properties using it are pure refs.
    expect((spec.components!.schemas!.U as any).properties.contact).toEqual({
      $ref: "#/components/schemas/Email",
    });
  });

  test("multi-level alias chains hoist each level separately", async () => {
    const { spec } = await compile(
      "alias-chain",
      `${PRELUDE}
/** @minLength 2 */
type ShortString = string;
/** @format uuid */
type IdString = ShortString;
interface U {
  id: IdString;
  /** @description an overriding doc */
  override: IdString;
}
/** @controller */
export class C {
  /** @post /u */
  m(req: TypedRequest<{ body: U }>): JsonResponse<U> {
    return Response.json({ id: "", override: "" });
  }
}
`
    );

    // Each named alias gets its own component.
    expect(spec.components!.schemas!.ShortString).toMatchObject({
      type: "string",
      minLength: 2,
    });
    // The intermediate alias `IdString` becomes a ref to `ShortString`,
    // with its own JSDoc constraints (`format: uuid`) sitting as siblings
    // alongside the ref (OpenAPI 3.1 permits this).
    expect(spec.components!.schemas!.IdString).toMatchObject({
      $ref: "#/components/schemas/ShortString",
      format: "uuid",
    });

    // Property uses are pure refs.
    const props = (spec.components!.schemas!.U as any).properties;
    expect(props.id).toEqual({ $ref: "#/components/schemas/IdString" });
    // Property-level metadata sits alongside the $ref.
    expect(props.override).toMatchObject({
      $ref: "#/components/schemas/IdString",
      description: "an overriding doc",
    });
  });
});

describe("request shapes (TypedRequest generics)", () => {
  test("params -> path parameters in the spec", async () => {
    const { spec } = await compile(
      "params",
      `${PRELUDE}
/** @controller */
export class C {
  /** @get /things/:id */
  m(req: TypedRequest<{ params: { id: string } }>): JsonResponse<unknown> {
    return Response.json({});
  }
}
`
    );
    const op = (spec.paths!["/things/{id}"] as any).get;
    expect(op.parameters[0]).toMatchObject({ name: "id", in: "path", required: true });
  });

  test("query -> query parameters with optional flag", async () => {
    const { spec } = await compile(
      "query",
      `${PRELUDE}
/** @controller */
export class C {
  /** @get /things */
  m(req: TypedRequest<{ query: { limit?: string; q?: string } }>): JsonResponse<unknown> {
    return Response.json({});
  }
}
`
    );
    const op = (spec.paths!["/things"] as any).get;
    const params = op.parameters as any[];
    for (const p of params) {
      expect(p.in).toBe("query");
      expect(p.required).toBe(false);
    }
  });

  test("body -> requestBody with referenced schema", async () => {
    const { spec } = await compile(
      "body",
      `${PRELUDE}
interface Dto { x: number }
/** @controller */
export class C {
  /** @post /t */
  m(req: TypedRequest<{ body: Dto }>): JsonResponse<Dto> {
    return Response.json({ x: 0 });
  }
}
`
    );
    const op = (spec.paths!["/t"] as any).post;
    expect(op.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/Dto",
    });
  });
});

describe("response shapes (TypedResponse generics)", () => {
  test("status code from second generic, content type from third", async () => {
    const { spec } = await compile(
      "status",
      `${PRELUDE}
interface User { id: string }
/** @controller */
export class C {
  /** @post /u */
  m(req: TypedRequest<{ body: User }>): TypedResponse<User, 201, "application/json"> {
    return Response.json({ id: "1" }, { status: 201 });
  }
}
`
    );
    const responses = (spec.paths!["/u"] as any).post.responses;
    expect(Object.keys(responses)).toEqual(["201"]);
    expect(responses["201"].description).toBe("Created");
  });

  test("Promise<TypedResponse<T>> is unwrapped", async () => {
    const { spec } = await compile(
      "promise-resp",
      `${PRELUDE}
interface User { id: string }
/** @controller */
export class C {
  /** @get /u */
  async m(req: TypedRequest): Promise<TypedResponse<User>> {
    return Response.json({ id: "1" });
  }
}
`
    );
    const r = (spec.paths!["/u"] as any).get.responses["200"];
    expect(r.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/User",
    });
  });

  test("TypedResponse<void, 204> emits No Content with empty body", async () => {
    const { spec } = await compile(
      "no-content",
      `${PRELUDE}
/** @controller */
export class C {
  /** @delete /u/:id */
  m(req: TypedRequest<{ params: { id: string } }>): TypedResponse<void, 204> {
    return new Response(null, { status: 204 });
  }
}
`
    );
    const r = (spec.paths!["/u/{id}"] as any).delete.responses["204"];
    expect(r.description).toBe("No Content");
    expect(r.content).toBeUndefined();
  });

  test("union TypedResponse → one entry per status", async () => {
    const { spec } = await compile(
      "multi-status",
      `${PRELUDE}
interface User { id: string }
interface Err { message: string }
/** @controller */
export class C {
  /** @get /u/:id */
  m(req: TypedRequest<{ params: { id: string } }>): TypedResponse<User> | TypedResponse<Err, 404> {
    return Response.json({ id: "1" });
  }
}
`
    );
    const responses = (spec.paths!["/u/{id}"] as any).get.responses;
    expect(Object.keys(responses).sort()).toEqual(["200", "404"]);
  });

  test("union TypedResponse with same status merges content types", async () => {
    const { spec } = await compile(
      "multi-ct",
      `${PRELUDE}
interface User { id: string }
/** @controller */
export class C {
  /** @get /u */
  m(req: TypedRequest): TypedResponse<User> | TypedResponse<User, 200, "application/xml"> {
    return Response.json({ id: "1" });
  }
}
`
    );
    const r200 = (spec.paths!["/u"] as any).get.responses["200"];
    expect(Object.keys(r200.content).sort()).toEqual(["application/json", "application/xml"]);
  });
});

describe("metadata on the operation", () => {
  test("first line of JSDoc becomes operation.summary", async () => {
    const { spec } = await compile(
      "summary",
      `${PRELUDE}
/** @controller */
export class C {
  /**
   * List things.
   * Detail line.
   * @get /things
   */
  m(req: TypedRequest): JsonResponse<unknown[]> {
    return Response.json([]);
  }
}
`
    );
    expect((spec.paths!["/things"] as any).get.summary).toContain("List things.");
  });

  test("@tag attaches OpenAPI tags to the operation", async () => {
    const { spec } = await compile(
      "tag",
      `${PRELUDE}
/** @controller */
export class C {
  /**
   * @get /a
   * @tag inventory
   * @tag inbound
   */
  m(req: TypedRequest): JsonResponse<unknown> {
    return Response.json({});
  }
}
`
    );
    const op = (spec.paths!["/a"] as any).get;
    expect(op.tags?.sort()).toEqual(["inbound", "inventory"]);
  });

  test("operationId equals the method name", async () => {
    const { spec } = await compile(
      "opid",
      `${PRELUDE}
/** @controller */
export class C {
  /** @get /a */
  fetchThing(req: TypedRequest): JsonResponse<unknown> {
    return Response.json({});
  }
}
`
    );
    expect((spec.paths!["/a"] as any).get.operationId).toBe("fetchThing");
  });
});

// ---------------------------------------------------------------------------
// Runtime validation — exercise the public entry points end-to-end
// ---------------------------------------------------------------------------

describe("runtime validation: 400 BadRequest (source=request)", () => {
  let request: (path: string, init?: RequestInit) => Promise<Response>;
  beforeAll(async () => {
    ({ request } = await compile(
      "rt-body",
      `${PRELUDE}
/** @format email */
type Email = string;
interface Dto {
  /** @minLength 1 @maxLength 50 */
  name: string;
  email: Email;
  /** @minimum 0 @maximum 150 */
  age?: number;
  /** @pattern ^[A-Z]+$ */
  code?: string;
  /** @minItems 1 @uniqueItems */
  tags?: string[];
}
/** @controller */
export class C {
  /** @post /v */
  m(req: TypedRequest<{ body: Dto }>): JsonResponse<Dto> {
    return Response.json({ name: "", email: "", tags: [] });
  }

  /** @get /v/:id */
  g(req: TypedRequest<{ params: { id: string } }>): JsonResponse<{}> {
    return Response.json({});
  }
}
`
    ));
  });

  const post = (body: unknown) =>
    request("/v", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("missing required field → 400, path identifies field", async () => {
    const res = await post({ email: "a@b.co" });
    expect(res.status).toBe(400);
    const j = (await res.json()) as any;
    expect(j.source).toBe("request");
    expect(j.location).toBe("body");
    expect(j.path).toBe(".name");
    expect(j.reason).toBe("expected string");
  });

  test("@format violation → 400 with format-specific reason", async () => {
    const res = await post({ name: "n", email: "not-an-email" });
    expect(res.status).toBe(400);
    const j = (await res.json()) as any;
    expect(j.path).toBe(".email");
    expect(j.reason).toBe("expected format email");
  });

  test("@minLength violation → 400", async () => {
    const res = await post({ name: "", email: "a@b.co" });
    const j = (await res.json()) as any;
    expect(j.path).toBe(".name");
    expect(j.reason).toBe("expected length >= 1");
  });

  test("@maxLength violation → 400", async () => {
    const res = await post({ name: "x".repeat(51), email: "a@b.co" });
    const j = (await res.json()) as any;
    expect(j.path).toBe(".name");
    expect(j.reason).toBe("expected length <= 50");
  });

  test("@minimum / @maximum violation → 400", async () => {
    const res = await post({ name: "n", email: "a@b.co", age: 999 });
    const j = (await res.json()) as any;
    expect(j.path).toBe(".age");
    expect(j.reason).toBe("expected <= 150");
  });

  test("@pattern violation → 400", async () => {
    const res = await post({ name: "n", email: "a@b.co", code: "lower" });
    const j = (await res.json()) as any;
    expect(j.path).toBe(".code");
    expect(j.reason).toMatch(/expected pattern/);
  });

  test("@uniqueItems violation → 400", async () => {
    const res = await post({
      name: "n",
      email: "a@b.co",
      tags: ["a", "a"],
    });
    const j = (await res.json()) as any;
    expect(j.path).toBe(".tags");
    expect(j.reason).toBe("expected unique items");
  });

  test("malformed JSON body → 400", async () => {
    const res = await request("/v", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).source).toBe("request");
  });

  test("valid input passes through to the handler", async () => {
    const res = await post({
      name: "Ada",
      email: "a@b.co",
      tags: ["one", "two"],
    });
    expect(res.status).toBe(200);
  });
});

describe("runtime validation: 500 InternalServerError (source=response)", () => {
  test("handler exceptions produce a 500 with reason", async () => {
    const { request } = await compile(
      "rt-throw",
      `${PRELUDE}
/** @controller */
export class C {
  /** @get /x */
  m(req: TypedRequest): JsonResponse<unknown> {
    throw new Error("kaboom");
  }
}
`
    );
    const res = await request("/x");
    expect(res.status).toBe(500);
    const j = (await res.json()) as any;
    expect(j.source).toBe("response");
    expect(j.reason).toBe("kaboom");
  });
});

describe("custom @format via runtime FORMATS extension", () => {
  test("a user-added FORMATS entry is honored by the generated validator", async () => {
    const { FORMATS } = await import("./runtime.ts");
    FORMATS.slug = (s: string) => /^[a-z0-9-]+$/.test(s);
    try {
      const { request } = await compile(
        "rt-custom-fmt",
        `${PRELUDE}
interface Dto {
  /** @format slug */
  slug: string;
}
/** @controller */
export class C {
  /** @post /s */
  m(req: TypedRequest<{ body: Dto }>): JsonResponse<Dto> {
    return Response.json({ slug: "" });
  }
}
`
      );
      const bad = await request("/s", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "Has Spaces!" }),
      });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as any).reason).toBe("expected format slug");

      const ok = await request("/s", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "ok-slug-123" }),
      });
      expect(ok.status).toBe(200);
    } finally {
      delete FORMATS.slug;
    }
  });
});

// ---------------------------------------------------------------------------
// Known gaps — kept as `test.skip` so the missing-vocabulary list stays visible
// ---------------------------------------------------------------------------

describe("not yet supported (tracked)", () => {
  test.skip("intersection types via allOf in the spec", () => {
    // TODO: verify `A & B` produces { allOf: [refA, refB] } in components.
  });

  test.skip("tuples produce `prefixItems` in spec", () => {
    // TODO: TypeScript tuples → JSON Schema 2020-12 `prefixItems`.
  });

  test.skip("recursive types compile a single $ref'd component", () => {
    // TODO: `interface Tree { children: Tree[] }` — currently risks
    // infinite recursion in the asserter / unbounded schema.
  });

  test.skip("additionalProperties: false enforcement at runtime", () => {
    // TODO: declare unknown properties on body → 400.
  });

  test.skip("minProperties / maxProperties enforcement at runtime", () => {
    // TODO: spec emits them today but the validator doesn't check them.
  });

  test.skip("nullable types render as { type: ['string','null'] } in 3.1", () => {
    // TODO: `string | null` → 3.1-style nullable in component schemas.
  });

  test.skip("query-string coercion (e.g. limit: number) without manual cast", () => {
    // TODO: query params arrive as strings; declared as number → 400 today.
    // Decide: enforce string-only at type level, or add codegen coercion.
  });

  test.skip("@enum tag for explicit enum values on a non-literal type", () => {
    // TODO: support `/** @enum a,b,c */ kind: string`.
  });

  test.skip("@readOnly / @writeOnly property flags", () => {
    // TODO: OpenAPI 3.x readOnly / writeOnly metadata.
  });

  test.skip("response body validation against the declared TypedResponse<T>", () => {
    // TODO: opt-in response validation that catches handler bugs.
  });

  test.skip("security schemes / requirements via JSDoc on controller / method", () => {
    // TODO: `@security bearerAuth` etc.
  });

  test.skip("servers / global info / contact / license via codegen options", () => {
    // TODO: cover via `generate({ base: {...} })` tests once stabilised.
  });
});
