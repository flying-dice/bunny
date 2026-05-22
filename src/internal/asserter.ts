import { Node, type Symbol as TsSymbol, type Type, type TypeNode } from "ts-morph";
import { getHoistTarget } from "./hoist.ts";
import {
  extractConstraints,
  extractConstraintsForProperty,
  type JsDocConstraints,
} from "./jsdoc-constraints.ts";

/**
 * Walks a ts-morph `Type` tree and emits hand-written-looking TypeScript
 * validator functions, one per primary type kind. Each "macro" is a small
 * function below — plain template literals, no template engine.
 *
 * Named (class / interface / aliased) types get promoted to top-level
 * `assert${Name}` functions; everywhere else they're referenced they emit
 * a delegate call. Anonymous shapes are inlined.
 */
export class Asserter {
  private namedFunctions = new Map<string, string>();
  private visiting = new Set<string>();
  private objCounter = 0;

  /** Emit a `function name(v: unknown): void` for a per-route input. */
  emitRouteValidator(name: string, type: Type): string {
    this.objCounter = 0;
    const body = this.assertOf(type, "v", '""');
    return routeValidatorMacro(name, body);
  }

  /** All component-level `assert${Name}` functions emitted as a side-effect of route validators. */
  emitNamedFunctions(): string[] {
    return [...this.namedFunctions.values()];
  }

  private assertOf(
    type: Type,
    vExpr: string,
    pathExpr: string,
    constraints?: JsDocConstraints,
    typeNode?: TypeNode
  ): string {
    // Prefer syntactic hoisting — any user-defined `type` / `interface` /
    // `class` referenced by name gets its own `assert${Name}` function.
    if (typeNode) {
      const target = getHoistTarget(typeNode);
      if (target) {
        this.registerNamedFromDecl(target.name, target.decl);
        return refMacro(target.name, vExpr, pathExpr);
      }
    }

    // Fallback for object-shaped types reached without a TypeNode (e.g.
    // array elements, union members) so existing behaviour holds.
    const namedName = this.detectNamed(type);
    if (namedName) {
      this.registerNamed(namedName, type);
      return refMacro(namedName, vExpr, pathExpr);
    }

    if (type.isString()) {
      return joinNonEmpty([
        stringMacro(vExpr, pathExpr),
        stringConstraintMacros(vExpr, pathExpr, constraints),
      ]);
    }
    if (type.isNumber()) {
      return joinNonEmpty([
        numberMacro(vExpr, pathExpr),
        numberConstraintMacros(vExpr, pathExpr, constraints),
      ]);
    }
    if (type.isBoolean()) return booleanMacro(vExpr, pathExpr);
    if (type.isNull()) return nullMacro(vExpr, pathExpr);

    if (type.isLiteral()) {
      const v = type.getLiteralValue();
      if (typeof v === "string" || typeof v === "number") {
        return literalMacro(vExpr, pathExpr, JSON.stringify(v));
      }
      if (type.isBooleanLiteral()) {
        return literalMacro(vExpr, pathExpr, type.getText());
      }
    }

    if (type.isArray()) {
      const el = type.getArrayElementType();
      const inner = el
        ? this.assertOf(el, `${vExpr}[_i]`, concatPath(pathExpr, `"[" + _i + "]"`))
        : "";
      return joinNonEmpty([
        arrayMacro(vExpr, pathExpr, inner),
        arrayConstraintMacros(vExpr, pathExpr, constraints),
      ]);
    }

    if (type.isUnion()) {
      const parts = type.getUnionTypes().filter((t) => !t.isUndefined());
      // The `T | undefined` shape of optional properties collapses here —
      // forward the constraints so optional fields still get their checks.
      if (parts.length === 1) return this.assertOf(parts[0]!, vExpr, pathExpr, constraints);
      const variants = parts.map((p) => this.assertOf(p, vExpr, pathExpr));
      return unionMacro(vExpr, pathExpr, variants);
    }

    if (type.isIntersection()) {
      return type
        .getIntersectionTypes()
        .map((t) => this.assertOf(t, vExpr, pathExpr))
        .join("\n");
    }

    if (type.isObject() || type.isClassOrInterface()) {
      return this.objectAssertion(type, vExpr, pathExpr);
    }

    // any / unknown / void → no runtime constraint
    return "";
  }

  private objectAssertion(type: Type, vExpr: string, pathExpr: string): string {
    const objVar = this.objCounter === 0 ? "o" : `o${this.objCounter}`;
    this.objCounter++;

    const props = type
      .getProperties()
      .map((prop) => {
        const decl = prop.getDeclarations()[0];
        if (!decl) return null;
        const propName = prop.getName();
        const propType = prop.getTypeAtLocation(decl);
        const constraints = extractConstraintsForProperty(decl);
        const propTypeNode = getPropTypeNode(decl);
        const access = isValidIdent(propName)
          ? `${objVar}.${propName}`
          : `${objVar}[${JSON.stringify(propName)}]`;
        const propPath = concatPath(pathExpr, `".${propName.replace(/"/g, '\\"')}"`);
        return {
          access,
          optional: isOptional(prop),
          inner: this.assertOf(propType, access, propPath, constraints, propTypeNode),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return objectMacro(vExpr, pathExpr, objVar, props);
  }

  private detectNamed(type: Type): string | null {
    // Only object-shaped named types get promoted into their own
    // `assert${Name}` function. Primitive aliases (e.g. `type Email = string`)
    // get inlined — their JSDoc constraints flow through
    // `extractConstraintsForProperty` instead.
    if (!type.isClassOrInterface() && !type.isObject()) return null;
    const sym = type.getAliasSymbol() ?? type.getSymbol();
    const name = sym?.getName();
    if (!name) return null;
    if (name === "__type" || name === "__object" || name === "Array") return null;
    return name;
  }

  private registerNamed(name: string, type: Type): void {
    if (this.namedFunctions.has(name) || this.visiting.has(name)) return;
    this.visiting.add(name);
    const savedObjCounter = this.objCounter;
    this.objCounter = 0;
    const body = this.objectAssertionInner(type, "v", "path");
    this.objCounter = savedObjCounter;
    this.visiting.delete(name);
    this.namedFunctions.set(name, namedValidatorMacro(`assert${name}`, body));
  }

  /**
   * Hoist a TypeScript declaration into a top-level `assert${Name}`
   * function. Works for any user-defined `type` / `interface` / `class` —
   * primitive aliases get a single type-check + their JSDoc constraints,
   * object types get a full property walk.
   */
  private registerNamedFromDecl(name: string, decl: Node): void {
    if (this.namedFunctions.has(name) || this.visiting.has(name)) return;
    this.visiting.add(name);
    const savedObjCounter = this.objCounter;
    this.objCounter = 0;

    let body: string;
    if (Node.isInterfaceDeclaration(decl) || Node.isClassDeclaration(decl)) {
      body = this.objectAssertion(decl.getType(), "v", "path");
    } else if (Node.isTypeAliasDeclaration(decl)) {
      // Recurse into the alias's RHS with the alias's own JSDoc constraints
      // so chained aliases (`type Email = string` with `@format email`) emit
      // their checks inside `assertEmail`.
      const aliasTypeNode = decl.getTypeNode();
      const aliasConstraints = extractConstraints(decl);
      body = this.assertOf(decl.getType(), "v", "path", aliasConstraints, aliasTypeNode);
    } else {
      body = "";
    }

    this.objCounter = savedObjCounter;
    this.visiting.delete(name);
    this.namedFunctions.set(name, namedValidatorMacro(`assert${name}`, body));
  }

  /** Same as objectAssertion, but skips the named-detection short-circuit. */
  private objectAssertionInner(type: Type, vExpr: string, pathExpr: string): string {
    if (type.isObject() || type.isClassOrInterface()) {
      return this.objectAssertion(type, vExpr, pathExpr);
    }
    return this.assertOf(type, vExpr, pathExpr);
  }
}

// ----------------------------------------------------------------------------
// Macros — one per primary type. Plain TS string templates.
// ----------------------------------------------------------------------------

function stringMacro(vExpr: string, pathExpr: string): string {
  return `if (typeof ${vExpr} !== "string") throw new AssertionError(${pathExpr}, "expected string");`;
}

function numberMacro(vExpr: string, pathExpr: string): string {
  return `if (typeof ${vExpr} !== "number") throw new AssertionError(${pathExpr}, "expected number");`;
}

function booleanMacro(vExpr: string, pathExpr: string): string {
  return `if (typeof ${vExpr} !== "boolean") throw new AssertionError(${pathExpr}, "expected boolean");`;
}

function nullMacro(vExpr: string, pathExpr: string): string {
  return `if (${vExpr} !== null) throw new AssertionError(${pathExpr}, "expected null");`;
}

function literalMacro(vExpr: string, pathExpr: string, literalExpr: string): string {
  return `if (${vExpr} !== ${literalExpr}) throw new AssertionError(${pathExpr}, "expected " + ${JSON.stringify(literalExpr)});`;
}

function refMacro(name: string, vExpr: string, pathExpr: string): string {
  return `assert${name}(${vExpr}, ${pathExpr});`;
}

function arrayMacro(vExpr: string, pathExpr: string, inner: string): string {
  if (!inner) {
    return `if (!Array.isArray(${vExpr})) throw new AssertionError(${pathExpr}, "expected array");`;
  }
  return [
    `if (!Array.isArray(${vExpr})) throw new AssertionError(${pathExpr}, "expected array");`,
    `for (let _i = 0; _i < ${vExpr}.length; _i++) {`,
    indent(inner, 2),
    `}`,
  ].join("\n");
}

function objectMacro(
  vExpr: string,
  pathExpr: string,
  objVar: string,
  props: { access: string; optional: boolean; inner: string }[]
): string {
  const lines: string[] = [
    `if (typeof ${vExpr} !== "object" || ${vExpr} === null || Array.isArray(${vExpr})) throw new AssertionError(${pathExpr}, "expected object");`,
  ];
  if (props.length > 0) {
    lines.push(`const ${objVar} = ${vExpr} as Record<string, unknown>;`);
  }
  for (const p of props) {
    if (!p.inner) continue;
    if (p.optional) {
      lines.push(`if (${p.access} !== undefined) {`, indent(p.inner, 2), `}`);
    } else {
      lines.push(p.inner);
    }
  }
  return lines.join("\n");
}

function unionMacro(_vExpr: string, pathExpr: string, variants: string[]): string {
  const tries = variants
    .map((v) => `  try {\n${indent(v, 4)}\n    return;\n  } catch {}`)
    .join("\n");
  return [
    `(() => {`,
    tries,
    `  throw new AssertionError(${pathExpr}, "no variant matched");`,
    `})();`,
  ].join("\n");
}

function routeValidatorMacro(name: string, body: string): string {
  return [`function ${name}(v: unknown): void {`, indent(body, 2), `}`].join("\n");
}

function namedValidatorMacro(name: string, body: string): string {
  return [`function ${name}(v: unknown, path: string): void {`, indent(body, 2), `}`].join("\n");
}

// Constraint-emission macros — additive checks layered on top of the
// primary-type assertion.

function stringConstraintMacros(vExpr: string, pathExpr: string, c?: JsDocConstraints): string {
  if (!c) return "";
  const lines: string[] = [];
  if (c.minLength !== undefined) {
    lines.push(
      `if (${vExpr}.length < ${c.minLength}) throw new AssertionError(${pathExpr}, "expected length >= ${c.minLength}");`
    );
  }
  if (c.maxLength !== undefined) {
    lines.push(
      `if (${vExpr}.length > ${c.maxLength}) throw new AssertionError(${pathExpr}, "expected length <= ${c.maxLength}");`
    );
  }
  if (c.pattern !== undefined) {
    const re = `/${c.pattern.replace(/\//g, "\\/")}/`;
    lines.push(
      `if (!${re}.test(${vExpr})) throw new AssertionError(${pathExpr}, ${JSON.stringify(
        `expected pattern ${c.pattern}`
      )});`
    );
  }
  if (c.format !== undefined) {
    // `!` because FORMATS[k] is `((s: string) => boolean) | undefined`; the
    // codegen guarantees the key exists at emit time.
    lines.push(
      `if (!FORMATS[${JSON.stringify(c.format)}]!(${vExpr})) throw new AssertionError(${pathExpr}, ${JSON.stringify(
        `expected format ${c.format}`
      )});`
    );
  }
  return lines.join("\n");
}

function numberConstraintMacros(vExpr: string, pathExpr: string, c?: JsDocConstraints): string {
  if (!c) return "";
  const lines: string[] = [];
  if (c.minimum !== undefined) {
    lines.push(
      `if (${vExpr} < ${c.minimum}) throw new AssertionError(${pathExpr}, "expected >= ${c.minimum}");`
    );
  }
  if (c.maximum !== undefined) {
    lines.push(
      `if (${vExpr} > ${c.maximum}) throw new AssertionError(${pathExpr}, "expected <= ${c.maximum}");`
    );
  }
  if (c.exclusiveMinimum !== undefined) {
    lines.push(
      `if (${vExpr} <= ${c.exclusiveMinimum}) throw new AssertionError(${pathExpr}, "expected > ${c.exclusiveMinimum}");`
    );
  }
  if (c.exclusiveMaximum !== undefined) {
    lines.push(
      `if (${vExpr} >= ${c.exclusiveMaximum}) throw new AssertionError(${pathExpr}, "expected < ${c.exclusiveMaximum}");`
    );
  }
  if (c.multipleOf !== undefined) {
    lines.push(
      `if (${vExpr} % ${c.multipleOf} !== 0) throw new AssertionError(${pathExpr}, "expected multiple of ${c.multipleOf}");`
    );
  }
  return lines.join("\n");
}

function arrayConstraintMacros(vExpr: string, pathExpr: string, c?: JsDocConstraints): string {
  if (!c) return "";
  const lines: string[] = [];
  if (c.minItems !== undefined) {
    lines.push(
      `if (${vExpr}.length < ${c.minItems}) throw new AssertionError(${pathExpr}, "expected at least ${c.minItems} items");`
    );
  }
  if (c.maxItems !== undefined) {
    lines.push(
      `if (${vExpr}.length > ${c.maxItems}) throw new AssertionError(${pathExpr}, "expected at most ${c.maxItems} items");`
    );
  }
  if (c.uniqueItems) {
    lines.push(
      `if (new Set(${vExpr}).size !== ${vExpr}.length) throw new AssertionError(${pathExpr}, "expected unique items");`
    );
  }
  return lines.join("\n");
}

function joinNonEmpty(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join("\n");
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

function isOptional(sym: TsSymbol): boolean {
  return (sym.compilerSymbol.flags & 16777216) !== 0;
}

function getPropTypeNode(decl: Node): TypeNode | undefined {
  const any = decl as unknown as {
    getTypeNode?: () => TypeNode | undefined;
  };
  return typeof any.getTypeNode === "function" ? any.getTypeNode() : undefined;
}

const IDENT_RX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function isValidIdent(s: string): boolean {
  return IDENT_RX.test(s);
}

/** Fold trivial `"" + ".x"` into `".x"` so paths read cleanly. */
function concatPath(base: string, segment: string): string {
  if (base === '""') return segment;
  return `${base} + ${segment}`;
}
