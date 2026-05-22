import type { DiscoveredController, DiscoveredInject, DiscoveredService } from "./discover.ts";
import { camelCase } from "./emit.ts";

export interface WireableNode {
  className: string;
  filePath: string;
  injects: DiscoveredInject[];
  kind: "service" | "controller";
}

export interface EmitWiringOptions {
  /**
   * Active profile for `@profile`-tagged services. Services with no
   * `@profile` tag match every profile; services with a tag only match the
   * exact name. Defaults to `"default"`.
   */
  profile?: string;
  exported?: boolean;
}

const DEFAULT_PROFILE = "default";

/**
 * Emit module-level singleton declarations for every discovered controller
 * and service. `@inject` directives become positional constructor arguments:
 *
 *     const _logService = new LogService();
 *     const _usersService = new UsersService(_logService);
 *     const _usersController = new UsersController(_usersService, _logService);
 *
 * Topologically ordered so each dependency exists before its dependant.
 *
 * Resolution for each `@inject` parameter happens by **symbol identity**:
 *
 *   - The parameter's type is resolved to a declaration symbol at discovery.
 *   - Every `@provides Token` is resolved to a declaration symbol at discovery.
 *   - Wiring picks the service whose `provides` list contains the inject's
 *     symbol key, filtered by the active profile.
 *
 * After filtering: exactly one candidate → wire it. Zero → error. Two or
 * more → error and demand profile disambiguation.
 */
export function emitWiring(
  services: DiscoveredService[],
  controllers: DiscoveredController[],
  optionsOrExported: EmitWiringOptions | boolean = {}
): {
  lines: string[];
  instanceFor: Map<string, string>;
  activeServices: DiscoveredService[];
} {
  const options: EmitWiringOptions =
    typeof optionsOrExported === "boolean" ? { exported: optionsOrExported } : optionsOrExported;
  const profile = options.profile ?? DEFAULT_PROFILE;
  const exported = options.exported ?? false;

  const activeServices = services.filter((s) => profileMatches(s, profile));

  const nodes: WireableNode[] = [
    ...activeServices.map((s) => ({ ...s, kind: "service" as const })),
    ...controllers.map((c) => ({ ...c, kind: "controller" as const })),
  ];

  const instanceFor = new Map<string, string>();
  for (const n of nodes) instanceFor.set(n.className, camelCase(n.className));

  // Resolve every @inject (by symbol key) to a concrete service class.
  for (const n of nodes) {
    n.injects = n.injects.map((inj) => resolveInject(n, inj, activeServices, profile));
    for (const inj of n.injects) {
      if (!instanceFor.has(inj.typeName)) {
        throw new Error(
          `bunny: ${n.className}.constructor(${inj.paramName}: ${inj.typeName}) — resolved class is not an active service.`
        );
      }
    }
  }

  const sorted = topoSort(nodes);

  const lines: string[] = [];
  const declKeyword = exported ? "export const" : "const";
  const renderCtor = (n: WireableNode): string => {
    const args = n.injects.map((i) => instanceFor.get(i.typeName)!).join(", ");
    return `${declKeyword} ${instanceFor.get(n.className)!} = new ${n.className}(${args});`;
  };

  if (activeServices.length) {
    lines.push("// ---- Service instances ----");
    for (const n of sorted) {
      if (n.kind === "service") lines.push(renderCtor(n));
    }
  }
  if (controllers.length) {
    if (activeServices.length) lines.push("");
    lines.push("// ---- Controller instances ----");
    for (const n of sorted) {
      if (n.kind === "controller") lines.push(renderCtor(n));
    }
  }

  return { lines, instanceFor, activeServices };
}

function profileMatches(service: DiscoveredService, active: string): boolean {
  return service.profile === undefined || service.profile === active;
}

/**
 * Find the service that satisfies an @inject by symbol identity. After
 * resolution, the inject's `typeName` is rewritten to the concrete class
 * name so the codegen knows which `instanceFor` entry to substitute.
 */
function resolveInject(
  node: { className: string },
  inj: DiscoveredInject,
  active: DiscoveredService[],
  profile: string
): DiscoveredInject {
  const providers = active.filter((s) => s.provides.some((p) => p.key === inj.typeKey));

  if (providers.length === 1) {
    const concrete = providers[0]!;
    return { paramName: inj.paramName, typeName: concrete.className, typeKey: concrete.selfKey };
  }

  const site = `${node.className}.constructor(${inj.paramName}: ${inj.typeName})`;

  if (providers.length === 0) {
    throw new Error(
      `bunny: ${site} — no active service @provides ${inj.typeName} under profile "${profile}".`
    );
  }

  const candidates = providers
    .map(
      (p) => `    - ${p.className}${p.profile ? ` (@profile ${p.profile})` : ""}  (${p.filePath})`
    )
    .join("\n");
  throw new Error(
    `bunny: ${site} — multiple services @provides ${inj.typeName} under profile "${profile}":\n${candidates}\n  Give each a distinct @profile, or restrict one to a non-"${profile}" profile.`
  );
}

function topoSort(nodes: WireableNode[]): WireableNode[] {
  const byName = new Map<string, WireableNode>();
  for (const n of nodes) byName.set(n.className, n);

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: WireableNode[] = [];

  function visit(n: WireableNode, trail: string[]): void {
    if (visited.has(n.className)) return;
    if (visiting.has(n.className)) {
      throw new Error(`bunny: @inject dependency cycle: ${[...trail, n.className].join(" → ")}`);
    }
    visiting.add(n.className);
    for (const inj of n.injects) {
      const dep = byName.get(inj.typeName);
      if (dep) visit(dep, [...trail, n.className]);
    }
    visiting.delete(n.className);
    visited.add(n.className);
    sorted.push(n);
  }

  for (const n of nodes) visit(n, []);
  return sorted;
}
