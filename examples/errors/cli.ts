#!/usr/bin/env bun
/**
 * Self-contained dispatcher for the errors example. Each command
 * module's compiled `.ts` exports a per-file `commands` const built
 * from its `#[command(...)]` macros. We merge them here and write a
 * tiny dispatch loop — same shape as examples/cli.
 *
 *   bun run example:errors                        # compile .tsb → .ts
 *   bun examples/errors/cli.ts calc 6 / 2
 *   bun examples/errors/cli.ts calc 1 / 0
 *   bun examples/errors/cli.ts register foo@bar.com alice99
 *   bun examples/errors/cli.ts double 21
 */
import { commands as calcCommands } from "./commands/CalcCommands.ts";

const commands = { ...calcCommands };

const [name, ...rest] = process.argv.slice(2);
if (!name || name === "help" || name === "--help" || name === "-h") {
  printHelp();
  process.exit(0);
}
const cmd = commands[name as keyof typeof commands];
if (!cmd) {
  process.stderr.write(`unknown command: ${name}\n`);
  printHelp();
  process.exit(1);
}
const args = cmd.params.map((p, i) => coerce(rest[i], p.type));
await cmd.handler(...args);

function coerce(raw: string | undefined, type: string): unknown {
  if (raw === undefined) return undefined;
  const t = type.trim();
  if (t === "number") return Number(raw);
  if (t === "boolean") return raw === "true" || raw === "1";
  return raw;
}

function printHelp(): void {
  const rows = Object.entries(commands).map(([n, spec]) => {
    const sig = spec.params.map((p) => `<${p.name}>`).join(" ");
    return `  ${n} ${sig}${spec.description ? "  — " + spec.description : ""}`;
  });
  process.stdout.write("Commands:\n" + rows.join("\n") + "\n");
}
