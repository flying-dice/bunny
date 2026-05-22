import { Node, SyntaxKind, type TypeNode } from "ts-morph";

export interface HoistTarget {
  name: string;
  decl:
    | Node /* TypeAliasDeclaration */
    | Node /* InterfaceDeclaration */
    | Node /* ClassDeclaration */;
}

/**
 * Identify a syntactic reference to a user-defined named type that should
 * be hoisted into `components/schemas`. Returns null when the reference is:
 *
 *   - not a TypeReference (e.g. `string`, an inline object literal, ...);
 *   - a generic instantiation (`Partial<User>`, `Box<T>`) — schemas don't
 *     have a useful name for those, and hoisting them would collapse all
 *     instantiations into one component;
 *   - resolved from `lib.d.ts`, `node_modules`, or any other declaration
 *     file the user didn't author (skips DOM types, TS utility types, ...);
 *   - not backed by a `type` / `interface` / `class` declaration.
 */
export function getHoistTarget(typeNode: TypeNode): HoistTarget | null {
  if (!typeNode.isKind(SyntaxKind.TypeReference)) return null;
  if (typeNode.getTypeArguments().length > 0) return null;

  const sym = typeNode.getTypeName().getSymbol();
  if (!sym) return null;
  const resolved = sym.getAliasedSymbol() ?? sym;
  const name = resolved.getName();
  if (!name || name === "__type" || name === "__object") return null;

  const decl = resolved.getDeclarations()[0];
  if (!decl) return null;

  const sf = decl.getSourceFile();
  if (sf.isFromExternalLibrary()) return null;
  if (sf.getFilePath().includes("/node_modules/")) return null;
  // Skip TypeScript's own library declaration files (lib.es*.d.ts, lib.dom.d.ts, ...).
  if (sf.isDeclarationFile() && /\/lib\.[^/]+\.d\.ts$/.test(sf.getFilePath())) {
    return null;
  }

  if (
    Node.isTypeAliasDeclaration(decl) ||
    Node.isInterfaceDeclaration(decl) ||
    Node.isClassDeclaration(decl)
  ) {
    return { name, decl };
  }
  return null;
}
