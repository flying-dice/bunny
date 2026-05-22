import type { Type } from "ts-morph";
import { type MethodDeclaration, SyntaxKind, type TypeNode } from "ts-morph";

export interface RouteTypes {
  params: Type | undefined;
  query: Type | undefined;
  body: Type | undefined;
}

const REQUEST_WRAPPERS = new Set([
  "TypedRequest",
  "JsonRequest",
  "XmlRequest",
  "TextRequest",
  "HtmlRequest",
  "FormRequest",
  "MultipartRequest",
]);

/**
 * Find the `req: TypedRequest<I, …>` parameter on `method` and return ts-morph
 * `Type`s for its `params`, `body`, and `query` (each `undefined` when not
 * declared). This is the AST equivalent of `extractRouteSchemas` and feeds
 * the Pug-based validator generator directly — no JSON Schema in the middle.
 */
export function extractRouteTypes(method: MethodDeclaration): RouteTypes {
  const inputNode = findRequestInputNode(method);
  if (!inputNode) return { params: undefined, query: undefined, body: undefined };

  const inputType = inputNode.getType();
  return {
    params: typeOfProperty(inputType, "params", inputNode),
    query: typeOfProperty(inputType, "query", inputNode),
    body: typeOfProperty(inputType, "body", inputNode),
  };
}

function findRequestInputNode(method: MethodDeclaration): TypeNode | undefined {
  for (const p of method.getParameters()) {
    const tn = p.getTypeNode();
    if (!tn?.isKind(SyntaxKind.TypeReference)) continue;
    if (!REQUEST_WRAPPERS.has(tn.getTypeName().getText())) continue;
    const args = tn.getTypeArguments();
    if (args[0]) return args[0];
  }
  return undefined;
}

function typeOfProperty(inputType: Type, name: string, _location: TypeNode): Type | undefined {
  const prop = inputType.getProperty(name);
  if (!prop) return undefined;
  const decl = prop.getDeclarations()[0];
  if (!decl) return undefined;
  return prop.getTypeAtLocation(decl);
}
