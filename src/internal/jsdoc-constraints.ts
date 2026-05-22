import { Node, SyntaxKind, type Symbol as TsSymbol, type TypeNode } from "ts-morph";

/**
 * JSON-Schema / OpenAPI vocabulary read from JSDoc tags on a declaration.
 * Each field maps 1:1 to its OpenAPI counterpart; the asserter emits a
 * matching runtime check for each one.
 */
export interface JsDocConstraints {
  // String
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // Number / integer
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  // Array
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  // Object
  minProperties?: number;
  maxProperties?: number;
  // Documentation / metadata
  default?: unknown;
  example?: unknown;
  deprecated?: boolean;
  title?: string;
  description?: string;
}

/**
 * Read constraint tags from any node that exposes JSDoc (property
 * signatures, parameter declarations, interface declarations, ...). Free-form
 * JSDoc description becomes `description` when no `@description` tag is set.
 */
export function extractConstraints(decl: Node | undefined): JsDocConstraints {
  if (!decl) return {};
  const anyDecl = decl as unknown as {
    getJsDocs?: () => Array<{
      getDescription: () => string;
      getTags: () => Array<{
        getTagName: () => string;
        getCommentText: () => string | undefined;
      }>;
    }>;
  };
  if (typeof anyDecl.getJsDocs !== "function") return {};
  const jsdocs = anyDecl.getJsDocs();
  if (jsdocs.length === 0) return {};

  const out: JsDocConstraints = {};
  for (const jsdoc of jsdocs) {
    const desc = jsdoc.getDescription().trim();
    if (desc && out.description === undefined) out.description = desc;

    for (const tag of jsdoc.getTags()) {
      const name = tag.getTagName().toLowerCase();
      const text = tag.getCommentText()?.trim();
      apply(out, name, text);
    }
  }
  return out;
}

function apply(out: JsDocConstraints, name: string, text: string | undefined): void {
  const n = (): number | undefined => (text === undefined ? undefined : Number(text));

  switch (name) {
    case "format":
      if (text) out.format = text;
      return;
    case "minlength":
      out.minLength = n();
      return;
    case "maxlength":
      out.maxLength = n();
      return;
    case "pattern":
      if (text) out.pattern = text;
      return;
    case "minimum":
      out.minimum = n();
      return;
    case "maximum":
      out.maximum = n();
      return;
    case "exclusiveminimum":
      out.exclusiveMinimum = n();
      return;
    case "exclusivemaximum":
      out.exclusiveMaximum = n();
      return;
    case "multipleof":
      out.multipleOf = n();
      return;
    case "minitems":
      out.minItems = n();
      return;
    case "maxitems":
      out.maxItems = n();
      return;
    case "uniqueitems":
      out.uniqueItems = text === undefined ? true : text !== "false";
      return;
    case "minproperties":
      out.minProperties = n();
      return;
    case "maxproperties":
      out.maxProperties = n();
      return;
    case "default":
      out.default = parseValue(text);
      return;
    case "example":
      out.example = parseValue(text);
      return;
    case "deprecated":
      out.deprecated = true;
      return;
    case "title":
      if (text) out.title = text;
      return;
    case "description":
      if (text) out.description = text;
      return;
  }
}

function parseValue(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Constraints from a property's own JSDoc *plus* any constraints carried by
 * a type alias used as the property's annotation:
 *
 *     /** @format email *\/
 *     type Email = string;
 *
 *     interface User {
 *       email: Email;   // gets `format: email` for free
 *
 *       /** @format email *\/
 *       backup: string; // own JSDoc still wins for collisions
 *     }
 *
 * Walks the alias chain syntactically (`type EmailToo = Email; backup:
 * EmailToo` works too), so the resolved-type erasure of alias info doesn't
 * matter. Property-level tags override anything inherited from aliases.
 */
export function extractConstraintsForProperty(propDecl: Node | undefined): JsDocConstraints {
  const own = extractConstraints(propDecl);
  if (!propDecl) return own;

  const typeNode = (
    propDecl as unknown as {
      getTypeNode?: () => TypeNode | undefined;
    }
  ).getTypeNode?.();
  const inherited = typeNode ? collectFromTypeNode(typeNode) : {};
  return { ...inherited, ...own };
}

function collectFromTypeNode(typeNode: TypeNode): JsDocConstraints {
  let merged: JsDocConstraints = {};
  const seen = new Set<string>();
  let current: TypeNode | undefined = typeNode;

  while (current) {
    if (!current.isKind(SyntaxKind.TypeReference)) break;
    const sym: TsSymbol | undefined = current.getTypeName().getSymbol();
    const name = sym?.getName();
    if (!sym || !name || seen.has(name)) break;
    seen.add(name);

    const decl: Node | undefined = sym.getDeclarations()[0];
    if (!decl || !Node.isTypeAliasDeclaration(decl)) break;

    const aliasJsDoc = extractConstraints(decl);
    // Closer-to-the-property aliases win over deeper ones.
    merged = { ...aliasJsDoc, ...merged };

    // Step into the alias's RHS for the next iteration.
    current = decl.getTypeNode();
  }

  return merged;
}
