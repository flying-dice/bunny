/**
 * Built-in macros for the Lua codegen.
 *
 * - Derive macros (Clone, Equals, ToTable, Display) emit full Lua function
 *   definitions that attach to the target struct's table.
 * - Field-constraint macros (minLength, maxLength, minimum, maximum, pattern)
 *   emit Lua runtime guards woven into `.new`.
 *
 * Function-attribute macros (route verbs, sql, command) were deliberately
 * dropped — those baked TS / Bun.serve / OpenAPI assumptions into the
 * compiler that don't carry to Lua.
 */

import type {
  DeriveMacro,
  FieldConstraintMacro,
  FunctionAttrMacro,
  MacroRegistry,
} from "./registry.ts";

export function registerBuiltins(registry: MacroRegistry): void {
  registry.register(DERIVE_CLONE);
  registry.register(DERIVE_EQUALS);
  registry.register(DERIVE_TO_TABLE);
  registry.register(DERIVE_DISPLAY);
  registry.register(CONSTRAINT_MIN_LENGTH);
  registry.register(CONSTRAINT_MAX_LENGTH);
  registry.register(CONSTRAINT_MINIMUM);
  registry.register(CONSTRAINT_MAXIMUM);
  registry.register(CONSTRAINT_PATTERN);
  registry.register(TEST_MACRO);
}

// ----------------------------------------------------------------------------
// Derives
// ----------------------------------------------------------------------------

const DERIVE_CLONE: DeriveMacro = {
  kind: "derive",
  name: "Clone",
  emit(_ctx, { struct }) {
    const name = struct.name;
    return [
      `function ${name}.clone(self)`,
      `  local copy = {}`,
      `  for k, v in pairs(self) do copy[k] = v end`,
      `  setmetatable(copy, ${name})`,
      `  return copy`,
      `end`,
    ].join("\n");
  },
};

const DERIVE_EQUALS: DeriveMacro = {
  kind: "derive",
  name: "Equals",
  emit(_ctx, { struct }) {
    const name = struct.name;
    const checks = struct.fields
      .map((f) => `a.${f.name} == b.${f.name}`)
      .join(" and ");
    const body = checks.length === 0 ? "true" : checks;
    return [
      `function ${name}.equals(a, b)`,
      `  if a == b then return true end`,
      `  if type(a) ~= "table" or type(b) ~= "table" then return false end`,
      `  return ${body}`,
      `end`,
    ].join("\n");
  },
};

const DERIVE_TO_TABLE: DeriveMacro = {
  kind: "derive",
  name: "ToTable",
  emit(_ctx, { struct }) {
    const name = struct.name;
    const lines = struct.fields.map((f) => `    ${f.name} = self.${f.name},`);
    return [
      `function ${name}.toTable(self)`,
      `  return {`,
      ...lines,
      `  }`,
      `end`,
    ].join("\n");
  },
};

const DERIVE_DISPLAY: DeriveMacro = {
  kind: "derive",
  name: "Display",
  emit(_ctx, { struct }) {
    const name = struct.name;
    const parts = struct.fields
      .map((f) => `${f.name}=" .. tostring(self.${f.name}) .. "`)
      .join(", ");
    return [
      `function ${name}.display(self)`,
      `  return "${name} { ${parts} }"`,
      `end`,
    ].join("\n");
  },
};

// ----------------------------------------------------------------------------
// Field constraints
// ----------------------------------------------------------------------------

const CONSTRAINT_MIN_LENGTH: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "minLength",
  emit(_ctx, { struct, field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if #data.${field.name} < ${n} then error("${struct.name}.${field.name}: minLength ${n}") end`,
    ];
  },
};

const CONSTRAINT_MAX_LENGTH: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "maxLength",
  emit(_ctx, { struct, field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if #data.${field.name} > ${n} then error("${struct.name}.${field.name}: maxLength ${n}") end`,
    ];
  },
};

const CONSTRAINT_MINIMUM: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "minimum",
  emit(_ctx, { struct, field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if data.${field.name} < ${n} then error("${struct.name}.${field.name}: minimum ${n}") end`,
    ];
  },
};

const CONSTRAINT_MAXIMUM: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "maximum",
  emit(_ctx, { struct, field, attr }) {
    const n = attr.argList[0] ?? "0";
    return [
      `if data.${field.name} > ${n} then error("${struct.name}.${field.name}: maximum ${n}") end`,
    ];
  },
};

const CONSTRAINT_PATTERN: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "pattern",
  emit(_ctx, { struct, field, attr }) {
    const pat = attr.argList[0] ?? `""`;
    return [
      `if not string.match(data.${field.name}, ${pat}) then error("${struct.name}.${field.name}: pattern ${pat}") end`,
    ];
  },
};

// ----------------------------------------------------------------------------
// Function attributes
// ----------------------------------------------------------------------------

/**
 * `#[test]` — register a zero-argument exported function with the module's
 * `__neoc_tests` table. The original function emits unchanged; the macro
 * appends a registration line at module scope that the `neoc test` driver
 * harvests when it runs the compiled `.lua`.
 */
const TEST_MACRO: FunctionAttrMacro = {
  kind: "function-attr",
  name: "test",
  emit(ctx, { fn }) {
    ctx.appendModule(
      [
        `__neoc_tests = __neoc_tests or {}`,
        `__neoc_tests[#__neoc_tests + 1] = { name = "${fn.name}", run = ${fn.name} }`,
      ].join("\n")
    );
    return { replacement: "" };
  },
};
