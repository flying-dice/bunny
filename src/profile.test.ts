import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { generateBun } from "./bun.ts";

const SRC = path.resolve("src/index.ts");

async function workspace(files: Record<string, string>): Promise<string> {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "bunny-profile-")));
  for (const [rel, content] of Object.entries(files)) {
    await Bun.write(path.join(dir, rel), content);
  }
  return dir;
}

function controllerSrc(): string {
  return `import type { TypedRequest, JsonResponse } from "${SRC}";
import type { Repo } from "./repo.ts";

/** @controller */
export class ThingsController {
  /** @inject repo */
  constructor(private repo: Repo) {}

  /** @get /things */
  list(_req: TypedRequest): JsonResponse<string[]> {
    return Response.json(this.repo.list());
  }
}
`;
}

const repoInterface = `export interface Repo { list(): string[]; }\n`;

// ---------------------------------------------------------------------------
// Single @provides — auto-wires with no profile
// ---------------------------------------------------------------------------

test("single @provides impl auto-wires into an interface-typed @inject", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/MemoryRepo.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo */
export class MemoryRepo implements Repo { list() { return ["m"]; } }
`,
    "src/ThingsController.ts": controllerSrc(),
  });
  const { app } = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
  });
  expect(app).toContain("export const _memoryRepo = new MemoryRepo();");
  expect(app).toContain("export const _thingsController = new ThingsController(_memoryRepo);");
});

// ---------------------------------------------------------------------------
// Two impls, profiles distinct → selected by --profile
// ---------------------------------------------------------------------------

test("profile selects between two @provides impls", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/MemoryRepo.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo @profile test */
export class MemoryRepo implements Repo { list() { return ["m"]; } }
`,
    "src/SqliteRepo.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo @profile production */
export class SqliteRepo implements Repo { list() { return ["s"]; } }
`,
    "src/ThingsController.ts": controllerSrc(),
  });

  const prod = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
    profile: "production",
  });
  expect(prod.app).toContain("new SqliteRepo()");
  expect(prod.app).toContain("new ThingsController(_sqliteRepo)");
  expect(prod.app).not.toContain("MemoryRepo");

  const test = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
    profile: "test",
  });
  expect(test.app).toContain("new MemoryRepo()");
  expect(test.app).toContain("new ThingsController(_memoryRepo)");
  expect(test.app).not.toContain("SqliteRepo");
});

// ---------------------------------------------------------------------------
// Missing for active profile
// ---------------------------------------------------------------------------

test("missing @provides for active profile throws a clear error", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/SqliteRepo.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo @profile production */
export class SqliteRepo implements Repo { list() { return ["s"]; } }
`,
    "src/ThingsController.ts": controllerSrc(),
  });
  expect(() =>
    generateBun({
      sourceFiles: `${cwd}/src/**/*.ts`,
      outDir: `${cwd}/out`,
      profile: "test",
    })
  ).toThrow(/no active service @provides Repo under profile "test"/);
});

// ---------------------------------------------------------------------------
// Ambiguous within a profile
// ---------------------------------------------------------------------------

test("two @provides under the same profile are ambiguous", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/A.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo */
export class A implements Repo { list() { return ["a"]; } }
`,
    "src/B.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo */
export class B implements Repo { list() { return ["b"]; } }
`,
    "src/ThingsController.ts": controllerSrc(),
  });
  expect(() =>
    generateBun({
      sourceFiles: `${cwd}/src/**/*.ts`,
      outDir: `${cwd}/out`,
    })
  ).toThrow(/multiple services @provides Repo under profile "default"[\s\S]+distinct @profile/);
});

// ---------------------------------------------------------------------------
// Untagged service matches every profile (default impl)
// ---------------------------------------------------------------------------

test("untagged @provides matches every profile (acts as default)", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/DefaultRepo.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo */
export class DefaultRepo implements Repo { list() { return ["d"]; } }
`,
    "src/ThingsController.ts": controllerSrc(),
  });
  const out = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
    profile: "anything",
  });
  expect(out.app).toContain("new DefaultRepo()");
});

// ---------------------------------------------------------------------------
// @provides token must resolve to a real relationship (implements / extends / self)
// ---------------------------------------------------------------------------

test("@provides referring to a name the class doesn't implement throws", async () => {
  const cwd = await workspace({
    "src/repo.ts": repoInterface,
    "src/Liar.ts": `import type { Repo } from "./repo.ts";
/** @provides Repo */
export class Liar { unrelated(): void {} }
`,
    "src/ThingsController.ts": controllerSrc(),
  });
  expect(() =>
    generateBun({
      sourceFiles: `${cwd}/src/**/*.ts`,
      outDir: `${cwd}/out`,
    })
  ).toThrow(/Liar: @provides Repo — class does not implement, extend, or equal "Repo"/);
});

// ---------------------------------------------------------------------------
// Class-as-own-token (no interface needed)
// ---------------------------------------------------------------------------

test("@provides ClassName lets a class act as its own token", async () => {
  const cwd = await workspace({
    "src/Counter.ts": `/** @provides Counter */
export class Counter { private n = 0; tick() { return ++this.n; } }
`,
    "src/AppController.ts": `import type { TypedRequest, JsonResponse } from "${SRC}";
import type { Counter } from "./Counter.ts";

/** @controller */
export class AppController {
  /** @inject counter */
  constructor(private counter: Counter) {}

  /** @get /tick */
  tick(_req: TypedRequest): JsonResponse<{ n: number }> {
    return Response.json({ n: this.counter.tick() });
  }
}
`,
  });
  const { app } = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
  });
  expect(app).toContain("new Counter()");
  expect(app).toContain("new AppController(_counter)");
});

// ---------------------------------------------------------------------------
// Same-name interfaces in different files don't collide (symbol-identity matching)
// ---------------------------------------------------------------------------

test("interfaces with the same name in different files don't collide", async () => {
  const cwd = await workspace({
    "src/auth/Repo.ts": `export interface Repo { authThing(): string; }\n`,
    "src/auth/AuthRepo.ts": `import type { Repo } from "./Repo.ts";
/** @provides Repo */
export class AuthRepo implements Repo { authThing() { return "auth"; } }
`,
    "src/billing/Repo.ts": `export interface Repo { billingThing(): string; }\n`,
    "src/billing/BillingRepo.ts": `import type { Repo } from "./Repo.ts";
/** @provides Repo */
export class BillingRepo implements Repo { billingThing() { return "bill"; } }
`,
    "src/AuthController.ts": `import type { TypedRequest, JsonResponse } from "${SRC}";
import type { Repo } from "./auth/Repo.ts";

/** @controller */
export class AuthController {
  /** @inject repo */
  constructor(private repo: Repo) {}

  /** @get /auth */
  authHello(_req: TypedRequest): JsonResponse<string> {
    return Response.json(this.repo.authThing());
  }
}
`,
    "src/BillingController.ts": `import type { TypedRequest, JsonResponse } from "${SRC}";
import type { Repo } from "./billing/Repo.ts";

/** @controller */
export class BillingController {
  /** @inject repo */
  constructor(private repo: Repo) {}

  /** @get /bill */
  billingHello(_req: TypedRequest): JsonResponse<string> {
    return Response.json(this.repo.billingThing());
  }
}
`,
  });
  const { app } = generateBun({
    sourceFiles: `${cwd}/src/**/*.ts`,
    outDir: `${cwd}/out`,
  });
  expect(app).toContain("new AuthRepo()");
  expect(app).toContain("new BillingRepo()");
  expect(app).toContain("new AuthController(_authRepo)");
  expect(app).toContain("new BillingController(_billingRepo)");
});
