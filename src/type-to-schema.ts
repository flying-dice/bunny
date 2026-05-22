import type { oas31 } from "openapi3-ts";
import { Node, type Symbol as TsSymbol, type Type, type TypeNode } from "ts-morph";
import { getHoistTarget } from "./internal/hoist.ts";
import {
  extractConstraints,
  extractConstraintsForProperty,
  type JsDocConstraints,
} from "./internal/jsdoc-constraints.ts";

type Schema = oas31.SchemaObject | oas31.ReferenceObject;

export class SchemaRegistry {
  readonly schemas = new Map<string, oas31.SchemaObject>();
  private visiting = new Set<string>();

  /**
   * Resolve a schema for a value that appears at a property / parameter
   * position. If the syntactic `typeNode` is a TypeReference to a
   * user-defined `type` / `interface` / `class`, hoist that target into
   * `components/schemas` and return `{ $ref }`. Otherwise produce an
   * inline schema from the resolved type.
   */
  schemaForReference(typeNode: TypeNode | undefined, type: Type): Schema {
    if (typeNode) {
      const target = getHoistTarget(typeNode);
      if (target) {
        this.registerComponent(target.name, target.decl);
        return { $ref: `#/components/schemas/${target.name}` };
      }
    }
    return this.fromType(type);
  }

  fromType(type: Type): Schema {
    if (type.isString()) return { type: "string" };
    if (type.isNumber()) return { type: "number" };
    if (type.isBoolean()) return { type: "boolean" };
    if (type.isNull()) return { type: "null" };
    if (type.isUndefined() || type.isVoid()) return {};
    if (type.isAny() || type.isUnknown()) return {};

    if (type.isLiteral()) {
      const v = type.getLiteralValue();
      if (typeof v === "string") return { type: "string", enum: [v] };
      if (typeof v === "number") return { type: "number", enum: [v] };
      if (type.isBooleanLiteral()) {
        return { type: "boolean", enum: [type.getText() === "true"] };
      }
    }

    if (type.isArray()) {
      const el = type.getArrayElementType();
      return { type: "array", items: el ? this.fromType(el) : {} };
    }

    if (type.isTuple()) {
      return {
        type: "array",
        prefixItems: type.getTupleElements().map((t) => this.fromType(t)),
      };
    }

    if (type.isUnion()) {
      const parts = type.getUnionTypes().filter((t) => !t.isUndefined());
      if (parts.length === 1) return this.fromType(parts[0]!);
      return { oneOf: parts.map((t) => this.fromType(t)) };
    }

    if (type.isIntersection()) {
      return { allOf: type.getIntersectionTypes().map((t) => this.fromType(t)) };
    }

    if (type.isClassOrInterface() || type.isObject()) {
      const sym = type.getAliasSymbol() ?? type.getSymbol();
      const name = sym?.getName();
      const isNamed = name && name !== "__type" && name !== "__object";
      if (isNamed) {
        if (!this.schemas.has(name) && !this.visiting.has(name)) {
          this.visiting.add(name);
          this.schemas.set(name, this.objectSchema(type));
          this.visiting.delete(name);
        }
        return { $ref: `#/components/schemas/${name}` };
      }
      return this.objectSchema(type);
    }

    return {};
  }

  /**
   * Hoist a named declaration as a component. The component's schema is
   * the declaration's right-hand side, plus any constraints from the
   * declaration's own JSDoc (so `/** @format email *\/ type Email = string`
   * lands as `{ type: "string", format: "email" }`).
   */
  private registerComponent(name: string, decl: Node): void {
    if (this.schemas.has(name) || this.visiting.has(name)) return;
    this.visiting.add(name);

    let schema: oas31.SchemaObject;
    if (Node.isInterfaceDeclaration(decl) || Node.isClassDeclaration(decl)) {
      schema = this.objectSchema(decl.getType());
    } else if (Node.isTypeAliasDeclaration(decl)) {
      const inner = this.schemaForReference(decl.getTypeNode(), decl.getType());
      // Promote inline schemas to a SchemaObject we can mutate; refs stay refs.
      schema = "$ref" in inner ? (inner as oas31.SchemaObject) : inner;
    } else {
      schema = {};
    }

    const aliasConstraints = extractConstraints(decl);
    const merged = attachConstraints(schema, aliasConstraints) as oas31.SchemaObject;
    this.schemas.set(name, merged);
    this.visiting.delete(name);
  }

  private objectSchema(type: Type): oas31.SchemaObject {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const prop of type.getProperties()) {
      const decl = prop.getDeclarations()[0];
      if (!decl) continue;
      const propType = prop.getTypeAtLocation(decl);
      const propTypeNode = getPropertyTypeNode(decl);
      const baseSchema = this.schemaForReference(propTypeNode, propType);
      // When the property resolves to a hoisted `$ref`, the alias chain's
      // constraints already live inside the component — only the property's
      // OWN JSDoc adds siblings (e.g. an override `description`).
      const constraints = isRefSchema(baseSchema)
        ? extractConstraints(decl)
        : extractConstraintsForProperty(decl);
      properties[prop.getName()] = attachConstraints(baseSchema, constraints);
      if (!this.isOptional(prop)) required.push(prop.getName());
    }
    const out: oas31.SchemaObject = { type: "object", properties };
    if (required.length) out.required = required;
    return out;
  }

  private isOptional(sym: TsSymbol): boolean {
    const flags = sym.compilerSymbol.flags;
    return (flags & 16777216) !== 0;
  }
}

function isRefSchema(schema: Schema): schema is oas31.ReferenceObject {
  return "$ref" in schema && typeof (schema as { $ref?: unknown }).$ref === "string";
}

function getPropertyTypeNode(decl: Node): TypeNode | undefined {
  const anyDecl = decl as unknown as {
    getTypeNode?: () => TypeNode | undefined;
  };
  return typeof anyDecl.getTypeNode === "function" ? anyDecl.getTypeNode() : undefined;
}

function attachConstraints(schema: Schema, c: JsDocConstraints): Schema {
  const fields = constraintsToFields(c);
  if (Object.keys(fields).length === 0) return schema;
  // OpenAPI 3.1 permits sibling keywords on a `$ref`, so the spread works for both refs and inline schemas.
  return { ...schema, ...fields } as Schema;
}

function constraintsToFields(c: JsDocConstraints): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.format !== undefined) out.format = c.format;
  if (c.minLength !== undefined) out.minLength = c.minLength;
  if (c.maxLength !== undefined) out.maxLength = c.maxLength;
  if (c.pattern !== undefined) out.pattern = c.pattern;
  if (c.minimum !== undefined) out.minimum = c.minimum;
  if (c.maximum !== undefined) out.maximum = c.maximum;
  if (c.exclusiveMinimum !== undefined) out.exclusiveMinimum = c.exclusiveMinimum;
  if (c.exclusiveMaximum !== undefined) out.exclusiveMaximum = c.exclusiveMaximum;
  if (c.multipleOf !== undefined) out.multipleOf = c.multipleOf;
  if (c.minItems !== undefined) out.minItems = c.minItems;
  if (c.maxItems !== undefined) out.maxItems = c.maxItems;
  if (c.uniqueItems !== undefined) out.uniqueItems = c.uniqueItems;
  if (c.minProperties !== undefined) out.minProperties = c.minProperties;
  if (c.maxProperties !== undefined) out.maxProperties = c.maxProperties;
  if (c.default !== undefined) out.default = c.default;
  if (c.example !== undefined) out.example = c.example;
  if (c.deprecated !== undefined) out.deprecated = c.deprecated;
  if (c.title !== undefined) out.title = c.title;
  if (c.description !== undefined) out.description = c.description;
  return out;
}
