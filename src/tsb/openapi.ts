/**
 * Aggregate OpenAPI operation fragments emitted by route macros into a
 * single OpenAPI 3.1 document.
 *
 * The route macros (`#[get(...)]` etc.) append `__openapi_<name>`
 * module-level consts to each compiled `.ts` file. This module walks the
 * compiled outputs, harvests those consts, and assembles a spec.
 */
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { buildProject } from "./compile.ts";

export interface OpenApiOptions {
  /** Source globs (relative to `cwd`). */
  sourceGlobs: string[];
  cwd: string;
  /** Output file path. If unset the JSON is returned only. */
  output?: string;
  /** Macro module paths forwarded to the compiler. */
  macroModules?: string[];
  /** Document metadata. */
  info?: { title?: string; version?: string; description?: string };
  /** Callback for log output. */
  log?: (msg: string) => void;
}

export interface OperationFragment {
  operationId: string;
  method: string;
  path: string;
  parameters: unknown[];
  responses: Record<string, unknown>;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas: Record<string, unknown> };
}

export async function generateOpenApi(opts: OpenApiOptions): Promise<OpenApiDocument> {
  const log = opts.log ?? ((m) => console.log(m));

  // Build .tsb → .ts first so we have importable modules.
  const outputs = await buildProject({
    sourceGlobs: opts.sourceGlobs,
    cwd: opts.cwd,
    macroModules: opts.macroModules,
    log,
  });

  const fragments: OperationFragment[] = [];
  for (const tsPath of outputs) {
    const fragments_ = await collectFragmentsFromModule(tsPath);
    fragments.push(...fragments_);
  }

  const doc: OpenApiDocument = {
    openapi: "3.1.0",
    info: {
      title: opts.info?.title ?? "Bunny API",
      version: opts.info?.version ?? "0.0.0",
      ...(opts.info?.description ? { description: opts.info.description } : {}),
    },
    paths: {},
  };

  for (const f of fragments) {
    const pathEntry = (doc.paths[f.path] ??= {});
    pathEntry[f.method.toLowerCase()] = {
      operationId: f.operationId,
      parameters: f.parameters,
      responses: f.responses,
    };
  }

  if (opts.output) {
    const outPath = path.resolve(opts.cwd, opts.output);
    await Bun.write(outPath, JSON.stringify(doc, null, 2));
    log(`wrote ${path.relative(opts.cwd, outPath) || outPath}`);
  }

  return doc;
}

/**
 * Dynamically import a compiled `.ts` and harvest every export whose
 * name starts with `__openapi_`. Returns an empty list if the module
 * doesn't load (e.g. it imports something we can't resolve at this
 * cwd).
 */
async function collectFragmentsFromModule(tsPath: string): Promise<OperationFragment[]> {
  const url = pathToFileURL(tsPath).href;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(url)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: OperationFragment[] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (!key.startsWith("__openapi_")) continue;
    if (value && typeof value === "object") out.push(value as OperationFragment);
  }
  return out;
}
