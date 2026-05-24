import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Drives `lua run-tests.lua` from inside `examples/features/` so the
// runtime + snapshot tests for the generated `.lua` files run as part
// of `bun test`. Skips gracefully when `lua` isn't on PATH.

const here = dirname(fileURLToPath(import.meta.url));

test("generated Lua passes feature runtime + snapshot tests", async () => {
  const lua = Bun.which("lua")
    ?? Bun.which("luajit")
    ?? Bun.which("lua5.4")
    ?? Bun.which("lua5.3")
    ?? Bun.which("lua5.2")
    ?? Bun.which("lua5.1");
  if (!lua) {
    console.warn("`lua` not on PATH — skipping runtime tests. Install via `brew install lua`.");
    return;
  }
  const proc = Bun.spawn({
    cmd: [lua, "run-tests.lua"],
    cwd: resolve(here),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  // Surface the runner's own pass/fail report so a failure here points
  // straight at the failing case, not at this assertion.
  if (proc.exitCode !== 0) {
    console.log(stdout);
    if (stderr.length > 0) console.error(stderr);
  }
  expect(proc.exitCode).toBe(0);
  expect(stdout).toMatch(/\d+ passed, 0 failed/);
});
