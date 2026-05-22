import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "./cli.ts";

const SRC = path.resolve("src/index.ts");

async function makeWorkspace(): Promise<string> {
  // macOS's `os.tmpdir()` returns `/var/folders/...` which symlinks to
  // `/private/var/folders/...`. Resolve up front so paths the CLI writes
  // (via rc's internal realpath) compare cleanly against `cwd`.
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "bunny-cli-")));
  await Bun.write(
    `${dir}/src/users.controller.ts`,
    `import type { TypedRequest, JsonResponse } from "${SRC}";

interface User { id: string; name: string }

/** @controller */
export class UsersController {
  /** @get /users/:id */
  getUser(req: TypedRequest<{ params: { id: string } }>): JsonResponse<User> {
    return Response.json({ id: req.params.id, name: "" });
  }
}
`
  );
  return dir;
}

// ---------------------------------------------------------------------------
// CLI-args-first (no config file)
// ---------------------------------------------------------------------------

test("CLI args alone: --out-dir writes openapi.json + app.ts + routes.ts by convention", async () => {
  const cwd = await makeWorkspace();
  const written = await runCli({
    cwd,
    argv: ["-s", "src/**/*.controller.ts", "-o", "out"],
    log: () => {},
  });
  expect(written.map((p) => path.relative(cwd, p)).sort()).toEqual([
    "out/app.ts",
    "out/openapi.json",
    "out/routes.ts",
  ]);

  const spec = JSON.parse(await Bun.file(`${cwd}/out/openapi.json`).text());
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.paths["/users/{id}"]).toBeDefined();
});

test("CLI args alone: --format yaml writes openapi.yaml", async () => {
  const cwd = await makeWorkspace();
  await runCli({
    cwd,
    argv: ["openapi", "-s", "src/**/*.controller.ts", "-o", "out", "--format", "yaml"],
    log: () => {},
  });
  expect(await Bun.file(`${cwd}/out/openapi.yaml`).text()).toMatch(/^openapi: 3\.1\.0/m);
});

test("CLI args alone: target selection emits only the chosen file", async () => {
  const cwd = await makeWorkspace();
  const written = await runCli({
    cwd,
    argv: ["openapi", "-s", "src/**/*.controller.ts", "-o", "out"],
    log: () => {},
  });
  expect(written.map((p) => path.relative(cwd, p))).toEqual(["out/openapi.json"]);
  expect(await Bun.file(`${cwd}/out/app.ts`).exists()).toBe(false);
  expect(await Bun.file(`${cwd}/out/routes.ts`).exists()).toBe(false);
});

test("CLI args alone: -s repeated picks up multiple globs", async () => {
  const cwd = await makeWorkspace();
  await Bun.write(
    `${cwd}/other/orders.controller.ts`,
    `import type { TypedRequest, JsonResponse } from "${SRC}";
/** @controller */
export class OrdersController {
  /** @get /orders */
  listOrders(req: TypedRequest): JsonResponse<unknown[]> {
    return Response.json([]);
  }
}
`
  );
  await runCli({
    cwd,
    argv: [
      "openapi",
      "-s",
      "src/**/*.controller.ts",
      "-s",
      "other/**/*.controller.ts",
      "-o",
      "out",
    ],
    log: () => {},
  });
  const spec = JSON.parse(await Bun.file(`${cwd}/out/openapi.json`).text());
  expect(Object.keys(spec.paths).sort()).toEqual(["/orders", "/users/{id}"]);
});

test("CLI args alone: --out-dir defaults to cwd when omitted", async () => {
  const cwd = await makeWorkspace();
  const written = await runCli({
    cwd,
    argv: ["openapi", "-s", "src/**/*.controller.ts"],
    log: () => {},
  });
  expect(written.map((p) => path.relative(cwd, p))).toEqual(["openapi.json"]);
});

// ---------------------------------------------------------------------------
// Mandatory-field assertions
// ---------------------------------------------------------------------------

test("missing --source throws a friendly error", async () => {
  const cwd = await makeWorkspace();
  await expect(runCli({ cwd, argv: ["openapi"], log: () => {} })).rejects.toThrow(
    /--source <glob> is required/
  );
});

test("unknown target throws", async () => {
  const cwd = await makeWorkspace();
  await expect(
    runCli({
      cwd,
      argv: ["wat", "--source", "x"],
      log: () => {},
    })
  ).rejects.toThrow(/unknown target/i);
});

test("invalid --format throws", async () => {
  const cwd = await makeWorkspace();
  await expect(
    runCli({
      cwd,
      argv: ["openapi", "-s", "src/**/*.controller.ts", "--format", "csv"],
      log: () => {},
    })
  ).rejects.toThrow(/format must be "json" or "yaml"/);
});

test("--help prints usage and writes nothing", async () => {
  const cwd = await makeWorkspace();
  const messages: string[] = [];
  const written = await runCli({
    cwd,
    argv: ["--help"],
    log: (m) => messages.push(m),
  });
  expect(written).toEqual([]);
  expect(messages.join("\n")).toMatch(/Usage: bunx @flying-dice\/bunny/);
});

// ---------------------------------------------------------------------------
// .bunnyrc file
// ---------------------------------------------------------------------------

test(".bunnyrc supplies values when no CLI flags are passed", async () => {
  const cwd = await makeWorkspace();
  await Bun.write(
    `${cwd}/.bunnyrc`,
    JSON.stringify({ sourceFiles: "src/**/*.controller.ts", outDir: "out" })
  );
  const written = await runCli({ cwd, argv: ["openapi"], log: () => {} });
  expect(written.map((p) => path.relative(cwd, p))).toEqual(["out/openapi.json"]);
});

test("CLI flags override .bunnyrc values", async () => {
  const cwd = await makeWorkspace();
  await Bun.write(
    `${cwd}/.bunnyrc`,
    JSON.stringify({ sourceFiles: "src/**/*.controller.ts", outDir: "from-rc" })
  );
  const written = await runCli({
    cwd,
    argv: ["openapi", "-o", "from-cli"],
    log: () => {},
  });
  expect(written.map((p) => path.relative(cwd, p))).toEqual(["from-cli/openapi.json"]);
  expect(await Bun.file(`${cwd}/from-rc/openapi.json`).exists()).toBe(false);
});
