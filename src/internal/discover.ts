import {
  type ClassDeclaration,
  type JSDoc,
  type JSDocTag,
  type MethodDeclaration,
  type ParameterDeclaration,
  Project,
  SyntaxKind,
  type Type,
} from "ts-morph";

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "options" | "head";

const HTTP_METHODS: ReadonlySet<HttpMethod> = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
]);

export interface DiscoveredRoute {
  httpMethod: HttpMethod;
  /** Full route path including any segment from the controller's namespace. */
  path: string;
  methodName: string;
  method: MethodDeclaration;
  tags: string[];
}

/**
 * A constructor `@inject`. `typeKey` is the symbol-identity key of the
 * declaration the parameter's type resolves to — providers are matched by
 * key, not by the type's textual name.
 */
export interface DiscoveredInject {
  paramName: string;
  /** Human-readable type name (for error messages). */
  typeName: string;
  /** Symbol identity of the resolved declaration. See {@link symbolKey}. */
  typeKey: string;
}

/**
 * One `@provides Token` declaration on a service. Both the token's textual
 * name (for messages) and the resolved declaration's symbol key (for
 * matching) are kept.
 */
export interface ProvideToken {
  name: string;
  key: string;
}

export interface DiscoveredController {
  className: string;
  filePath: string;
  routes: DiscoveredRoute[];
  injects: DiscoveredInject[];
}

export interface DiscoveredService {
  className: string;
  filePath: string;
  /** Symbol key of the class declaration itself. */
  selfKey: string;
  injects: DiscoveredInject[];
  /** Every `@provides Token` on the class, with each token resolved to a symbol key. */
  provides: ProvideToken[];
  /** Single `@profile <name>` value; undefined means "matches every profile". */
  profile: string | undefined;
}

export interface DiscoverOptions {
  sourceFiles: string | string[];
  tsConfigFilePath?: string;
}

export function loadProject(options: DiscoverOptions): Project {
  const project = options.tsConfigFilePath
    ? new Project({ tsConfigFilePath: options.tsConfigFilePath })
    : new Project({ compilerOptions: { allowJs: true, target: 99 } });

  const globs = Array.isArray(options.sourceFiles) ? options.sourceFiles : [options.sourceFiles];
  project.addSourceFilesAtPaths(globs);
  // Pull in every file the seeds transitively import — so pointing at a
  // controller is enough to discover the `@provides` classes it injects.
  project.resolveSourceFileDependencies();
  return project;
}

/**
 * Discover controllers via JSDoc tags.
 *
 * - A class is a controller iff its JSDoc has a bare `@controller` tag.
 * - A method is a route iff its JSDoc has one of `@get` / `@post` / etc.,
 *   followed by the full route path: `@get /users/:id`.
 * - `@tag NAME` may appear on a method (multiple allowed).
 */
export function discoverControllers(project: Project): DiscoveredController[] {
  const out: DiscoveredController[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      if (!findTag(cls, "controller")) continue;
      const className = cls.getName();
      if (!className) continue;

      const routes: DiscoveredRoute[] = [];
      for (const method of cls.getInstanceMethods()) {
        const routeTag = findHttpMethodTag(method);
        if (!routeTag) continue;
        routes.push({
          httpMethod: routeTag.name,
          path: readTagText(routeTag.tag) ?? "/",
          methodName: method.getName(),
          method,
          tags: collectTagValues(method, "tag"),
        });
      }

      out.push({
        className,
        filePath: sf.getFilePath(),
        routes,
        injects: collectInjects(cls),
      });
    }
  }
  assertUniqueOperationIds(out);
  return out;
}

/**
 * Discover services. A class is a service iff it carries at least one
 * `@provides <Token>` tag. The token must resolve to a type the class
 * actually has a relationship with — either it `implements` the type, it
 * `extends` the type, or the token is the class itself (`@provides
 * UsersService` on `class UsersService`).
 */
export function discoverServices(project: Project): DiscoveredService[] {
  const out: DiscoveredService[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      const providesTagValues = collectTagValues(cls, "provides");
      if (providesTagValues.length === 0) continue;
      const className = cls.getName();
      if (!className) continue;

      const profileValues = collectTagValues(cls, "profile");
      if (profileValues.length > 1) {
        throw new Error(
          `bunny: ${className}: multiple @profile tags found — a service may declare at most one profile.`
        );
      }

      const provides: ProvideToken[] = providesTagValues.map((tokenName) =>
        resolveProvidesToken(cls, tokenName)
      );

      out.push({
        className,
        filePath: sf.getFilePath(),
        selfKey: symbolKey(cls.getType()) ?? `${sf.getFilePath()}:${cls.getStart()}`,
        injects: collectInjects(cls),
        provides,
        profile: profileValues[0],
      });
    }
  }
  return out;
}

/**
 * Resolve `@provides <Token>` against the class. The token must match
 * either an `implements` clause, the `extends` clause, or the class's own
 * name. Returns the token name plus the resolved declaration's symbol key.
 */
function resolveProvidesToken(cls: ClassDeclaration, tokenName: string): ProvideToken {
  const className = cls.getName();
  const matchers: { label: string; type: Type | undefined }[] = [];

  for (const impl of cls.getImplements()) {
    if (impl.getExpression().getText() === tokenName) {
      matchers.push({ label: `implements ${tokenName}`, type: impl.getType() });
    }
  }
  const ext = cls.getExtends();
  if (ext && ext.getExpression().getText() === tokenName) {
    matchers.push({ label: `extends ${tokenName}`, type: ext.getType() });
  }
  if (className === tokenName) {
    matchers.push({ label: `is ${tokenName}`, type: cls.getType() });
  }

  if (matchers.length === 0) {
    throw new Error(
      `bunny: ${className}: @provides ${tokenName} — class does not implement, extend, or equal "${tokenName}". Add \`implements ${tokenName}\` (or rename the @provides token to match the class itself).`
    );
  }

  const resolved = matchers.find((m) => symbolKey(m.type) !== undefined) ?? matchers[0]!;
  const key = symbolKey(resolved.type);
  if (!key) {
    throw new Error(
      `bunny: ${className}: @provides ${tokenName} — could not resolve "${tokenName}" to a declaration.`
    );
  }
  return { name: tokenName, key };
}

/**
 * Read `@inject <paramName>` directives from the class's constructor JSDoc.
 * The named parameter's TypeScript type is resolved to its declaration
 * symbol so the wiring layer can match it to a `@provides` token.
 */
function collectInjects(cls: ClassDeclaration): DiscoveredInject[] {
  const ctor = cls.getConstructors()[0];
  if (!ctor) return [];

  const named = new Set<string>();
  for (const tag of allTags(ctor)) {
    if (tag.getTagName().toLowerCase() !== "inject") continue;
    const arg = readTagText(tag);
    if (!arg) {
      throw new Error(
        `bunny: ${cls.getName()}: @inject on a constructor needs a parameter name (e.g. \`@inject users\`).`
      );
    }
    named.add(arg);
  }
  if (named.size === 0) return [];

  const params = ctor.getParameters();
  const paramNames = new Set(params.map((p) => p.getName()));
  for (const n of named) {
    if (!paramNames.has(n)) {
      throw new Error(
        `bunny: ${cls.getName()}: @inject ${n} doesn't match any constructor parameter (have: ${[...paramNames].join(", ") || "none"}).`
      );
    }
  }

  const out: DiscoveredInject[] = [];
  for (const param of params) {
    if (!named.has(param.getName())) {
      throw new Error(
        `bunny: ${cls.getName()}: constructor parameter "${param.getName()}" is not annotated with @inject; every constructor parameter must be @inject'd or none at all.`
      );
    }
    out.push(resolveInjectParam(cls, param));
  }
  return out;
}

function resolveInjectParam(cls: ClassDeclaration, param: ParameterDeclaration): DiscoveredInject {
  const tn = param.getTypeNode();
  if (!tn?.isKind(SyntaxKind.TypeReference)) {
    throw new Error(
      `bunny: ${cls.getName()}.constructor(${param.getName()}): @inject parameter must have a named type annotation (a class or interface).`
    );
  }
  const typeName = tn.getTypeName().getText();
  const key = symbolKey(param.getType());
  if (!key) {
    throw new Error(
      `bunny: ${cls.getName()}.constructor(${param.getName()}): @inject parameter type "${typeName}" did not resolve to a named declaration.`
    );
  }
  return { paramName: param.getName(), typeName, typeKey: key };
}

/**
 * Stable identity key for the underlying declaration of a type. Two
 * references to the same interface/class/type alias produce the same key;
 * unrelated declarations that happen to share a name produce different
 * keys (because their declaration nodes live at different positions).
 */
export function symbolKey(type: Type | undefined): string | undefined {
  if (!type) return undefined;
  const sym = type.getSymbol() ?? type.getAliasSymbol();
  const decl = sym?.getDeclarations()[0];
  if (!decl) return undefined;
  return `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`;
}

function allTags(node: { getJsDocs(): JSDoc[] }): JSDocTag[] {
  return node.getJsDocs().flatMap((j) => j.getTags());
}

function findTag(node: { getJsDocs(): JSDoc[] }, name: string): JSDocTag | undefined {
  return allTags(node).find((t) => t.getTagName().toLowerCase() === name);
}

function findHttpMethodTag(
  method: MethodDeclaration
): { name: HttpMethod; tag: JSDocTag } | undefined {
  for (const t of allTags(method)) {
    const n = t.getTagName().toLowerCase() as HttpMethod;
    if (HTTP_METHODS.has(n)) return { name: n, tag: t };
  }
  return undefined;
}

function collectTagValues(node: { getJsDocs(): JSDoc[] }, name: string): string[] {
  const out: string[] = [];
  for (const t of allTags(node)) {
    if (t.getTagName().toLowerCase() !== name) continue;
    const text = readTagText(t);
    if (text !== undefined) out.push(text);
  }
  return out;
}

function readTagText(tag: JSDocTag): string | undefined {
  const text = tag.getCommentText()?.trim();
  return text ? text : undefined;
}

function assertUniqueOperationIds(controllers: DiscoveredController[]): void {
  const seen = new Map<string, { controller: string; route: DiscoveredRoute }[]>();
  for (const c of controllers) {
    for (const r of c.routes) {
      const arr = seen.get(r.methodName) ?? [];
      arr.push({ controller: c.className, route: r });
      seen.set(r.methodName, arr);
    }
  }

  const collisions: string[] = [];
  for (const [id, entries] of seen) {
    if (entries.length < 2) continue;
    const locations = entries
      .map(
        (e) =>
          `    - ${e.controller}.${e.route.methodName}  (${e.route.httpMethod.toUpperCase()} ${e.route.path})`
      )
      .join("\n");
    collisions.push(`  operationId "${id}" is used by:\n${locations}`);
  }

  if (collisions.length === 0) return;
  throw new Error(
    `bunny: duplicate operationId(s) across controllers — method names must be unique because they become OpenAPI operationIds.\n${collisions.join(
      "\n"
    )}`
  );
}
