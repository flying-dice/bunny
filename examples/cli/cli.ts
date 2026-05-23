#!/usr/bin/env bun
/**
 * Entry point. Each command module's compiled `.ts` exports a per-file
 * `commands` const built from its `#[command(...)]` macros. Merge them
 * here, then dispatch — bunny doesn't generate this file.
 *
 *   bun run example:cli     # compile .tsb → .ts
 */
import { commands as bookCommands } from "./commands/BookCommands.ts";

const commands = { ...bookCommands };

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
