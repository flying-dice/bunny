import { oas31 } from "openapi3-ts";
import { type MethodDeclaration, SyntaxKind, type Type, type TypeNode } from "ts-morph";
import {
  type DiscoveredRoute,
  type DiscoverOptions,
  discoverControllers,
  loadProject,
} from "./internal/discover.ts";
import { normalizePath } from "./internal/path.ts";
import { SchemaRegistry } from "./type-to-schema.ts";

export interface GenerateOptions extends DiscoverOptions {
  /** Base OpenAPI document to merge into (info, servers, etc.). */
  base?: Partial<oas31.OpenAPIObject>;
}

export function generate(options: GenerateOptions): oas31.OpenAPIObject {
  const project = loadProject(options);
  const controllers = discoverControllers(project);

  const builder = new oas31.OpenApiBuilder({
    openapi: "3.1.0",
    info: { title: "API", version: "1.0.0" },
    paths: {},
    components: { schemas: {} },
    ...options.base,
  } as oas31.OpenAPIObject);

  const registry = new SchemaRegistry();
  const paths: Record<string, oas31.PathItemObject> = {};

  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      const { openapiPath, pathParamNames } = toOpenApiPath(normalizePath(route.path));
      const operation = buildOperation(route, registry, pathParamNames);
      if (route.tags.length) operation.tags = dedupe(route.tags);
      const item = paths[openapiPath] ?? {};
      (item as Record<string, oas31.OperationObject>)[route.httpMethod] = operation;
      paths[openapiPath] = item;
    }
  }

  for (const [p, item] of Object.entries(paths)) builder.addPath(p, item);
  for (const [name, schema] of registry.schemas) builder.addSchema(name, schema);

  return builder.getSpec();
}

function buildOperation(
  route: DiscoveredRoute,
  registry: SchemaRegistry,
  pathParamNames: Set<string>
): oas31.OperationObject {
  const method = route.method;
  const responses: oas31.ResponsesObject = {};
  const op: oas31.OperationObject = {
    operationId: method.getName(),
    responses,
  };

  const parameters: oas31.ParameterObject[] = [];
  let requestBody: oas31.RequestBodyObject | undefined;

  const requestSig = findRequestInput(method);
  const input = requestSig?.inputNode;
  const requestContentType = requestSig?.contentType ?? "application/json";
  if (input) {
    const inputType = input.getType();
    const params = inputType.getProperty("params");
    const query = inputType.getProperty("query");
    const body = inputType.getProperty("body");

    if (params) {
      for (const prop of params.getTypeAtLocation(input).getProperties()) {
        const decl = prop.getDeclarations()[0];
        if (!decl) continue;
        parameters.push({
          name: prop.getName(),
          in: "path",
          required: true,
          schema: registry.fromType(prop.getTypeAtLocation(decl)),
        });
      }
    }

    if (query) {
      for (const prop of query.getTypeAtLocation(input).getProperties()) {
        const decl = prop.getDeclarations()[0];
        if (!decl) continue;
        parameters.push({
          name: prop.getName(),
          in: "query",
          required: !isOptionalSymbol(prop),
          schema: registry.fromType(prop.getTypeAtLocation(decl)),
        });
      }
    }

    if (body) {
      const decl = body.getDeclarations()[0];
      if (decl) {
        requestBody = {
          required: !isOptionalSymbol(body),
          content: {
            [requestContentType]: {
              schema: registry.fromType(body.getTypeAtLocation(decl)),
            },
          },
        };
      }
    }
  }

  for (const name of pathParamNames) {
    if (!parameters.some((p) => p.in === "path" && p.name === name)) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
  }

  if (parameters.length) op.parameters = parameters;
  if (requestBody) op.requestBody = requestBody;

  const responseShapes = extractResponses(unwrapPromise(method.getReturnType()));
  const byStatus = new Map<number, ResponseShape[]>();
  for (const shape of responseShapes) {
    const arr = byStatus.get(shape.status) ?? [];
    arr.push(shape);
    byStatus.set(shape.status, arr);
  }
  for (const [status, shapes] of byStatus) {
    const code = String(status);
    const content: Record<string, oas31.MediaTypeObject> = {};
    for (const sh of shapes) {
      if (!sh.body) continue;
      const schema = registry.fromType(sh.body);
      const isEmpty = typeof schema === "object" && Object.keys(schema).length === 0;
      if (!isEmpty) content[sh.contentType] = { schema };
    }
    responses[code] =
      Object.keys(content).length === 0
        ? { description: defaultDescription(status) }
        : { description: defaultDescription(status), content };
  }

  const jsdoc = method.getJsDocs()[0]?.getDescription().trim();
  if (jsdoc) op.summary = jsdoc;

  return op;
}

interface RequestSig {
  inputNode: TypeNode;
  contentType: string;
}

/**
 * Recognised request wrapper names → their implicit content type. Only
 * `TypedRequest` allows an explicit second type argument; aliases lock in
 * their media type by name.
 */
const REQUEST_ALIASES: Record<string, string> = {
  TypedRequest: "application/json",
  JsonRequest: "application/json",
  XmlRequest: "application/xml",
  TextRequest: "text/plain",
  HtmlRequest: "text/html",
  FormRequest: "application/x-www-form-urlencoded",
  MultipartRequest: "multipart/form-data",
};

function findRequestInput(method: MethodDeclaration): RequestSig | undefined {
  for (const p of method.getParameters()) {
    const tn = p.getTypeNode();
    if (!tn?.isKind(SyntaxKind.TypeReference)) continue;
    const name = tn.getTypeName().getText();
    const aliasContentType = REQUEST_ALIASES[name];
    if (aliasContentType === undefined) continue;

    const args = tn.getTypeArguments();
    if (!args[0]) return undefined;

    // Only the canonical `TypedRequest<I, "...">` lets you override the
    // content type explicitly; the aliases are fixed by their name.
    const contentType =
      name === "TypedRequest" ? (literalString(args[1]) ?? aliasContentType) : aliasContentType;

    return { inputNode: args[0], contentType };
  }
  return undefined;
}

function literalString(node: TypeNode | undefined): string | undefined {
  if (!node?.isKind(SyntaxKind.LiteralType)) return undefined;
  const literal = node.getLiteral();
  if (
    literal.isKind(SyntaxKind.StringLiteral) ||
    literal.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return literal.getLiteralText();
  }
  return undefined;
}

function isOptionalSymbol(sym: import("ts-morph").Symbol): boolean {
  return (sym.compilerSymbol.flags & 16777216) !== 0;
}

function unwrapPromise(type: Type): Type {
  const sym = type.getSymbol() ?? type.getAliasSymbol();
  if (sym?.getName() === "Promise") {
    const args = type.getTypeArguments();
    if (args[0]) return args[0];
  }
  return type;
}

interface ResponseShape {
  status: number;
  body: Type | undefined;
  contentType: string;
}

/**
 * Walks the return type into one ResponseShape per declared status.
 *
 * - `TypedResponse<T, S>` = `Response & { __body?: T; __status?: S }` —
 *   read both brands.
 * - Union types produce one response per member.
 * - Plain `Response` (no brand) → empty 200.
 */
function extractResponses(type: Type): ResponseShape[] {
  const members = type.isUnion() ? type.getUnionTypes() : [type];
  return members.map(extractOne);
}

function extractOne(type: Type): ResponseShape {
  let body: Type | undefined;
  let status: number | undefined;
  let contentType: string | undefined;

  for (const t of type.isIntersection() ? type.getIntersectionTypes() : [type]) {
    const bodyBrand = t.getProperty("__body");
    if (bodyBrand && body === undefined) {
      const decl = bodyBrand.getDeclarations()[0];
      if (decl) {
        const inner = stripUndefined(bodyBrand.getTypeAtLocation(decl));
        if (inner && !inner.isVoid() && !inner.isUndefined()) body = inner;
      }
    }
    const statusBrand = t.getProperty("__status");
    if (statusBrand && status === undefined) {
      const decl = statusBrand.getDeclarations()[0];
      if (decl) {
        const inner = stripUndefined(statusBrand.getTypeAtLocation(decl));
        const literal = inner?.getLiteralValue();
        if (typeof literal === "number") status = literal;
      }
    }
    const ctBrand = t.getProperty("__contentType");
    if (ctBrand && contentType === undefined) {
      const decl = ctBrand.getDeclarations()[0];
      if (decl) {
        const inner = stripUndefined(ctBrand.getTypeAtLocation(decl));
        const literal = inner?.getLiteralValue();
        if (typeof literal === "string") contentType = literal;
      }
    }
  }

  if (status === undefined) {
    const sym = type.getSymbol() ?? type.getAliasSymbol();
    const name = sym?.getName();
    if (name === "Response" || name === "TypedResponse") {
      return { status: 200, body: undefined, contentType: "application/json" };
    }
    status = 200;
  }

  return { status, body, contentType: contentType ?? "application/json" };
}

const STATUS_DESCRIPTIONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

function defaultDescription(status: number): string {
  return STATUS_DESCRIPTIONS[status] ?? `Status ${status}`;
}

function dedupe<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

/** Strip `undefined` from a union (optional properties resolve to `T | undefined`). */
function stripUndefined(type: Type): Type | undefined {
  if (!type.isUnion()) return type;
  const parts = type.getUnionTypes().filter((u) => !u.isUndefined());
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0]!;
  return type;
}

function toOpenApiPath(path: string): {
  openapiPath: string;
  pathParamNames: Set<string>;
} {
  const names = new Set<string>();
  const openapiPath = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, n) => {
    names.add(n);
    return `{${n}}`;
  });
  for (const m of path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    names.add(m[1]!);
  }
  return { openapiPath, pathParamNames: names };
}
