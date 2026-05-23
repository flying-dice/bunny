/**
 * Example user-authored macros for neoc.
 *
 * Load via:
 *
 *   neoc build -s 'app.neoc' --macro ./macros.ts
 *
 * The default export is an array of `Macro` values. The compiler walks
 * the array and registers each one before running codegen.
 */
import type { DeriveMacro, FieldConstraintMacro, Macro } from "@flying-dice/neoc-compiler/macro";

/**
 * `#[derive(JsonString)]` — emit a `Foo.toJsonString(self)` method that
 * returns a JSON-encoded string of the struct's fields.
 *
 * The encoder is generated inline per struct. It handles strings
 * (escaping quotes and backslashes), numbers, booleans, and nil. The
 * goal is to demonstrate a derive macro that emits a non-trivial Lua
 * function — not to be a complete JSON library.
 */
const DERIVE_JSON_STRING: DeriveMacro = {
  kind: "derive",
  name: "JsonString",
  emit(_ctx, { struct }) {
    const name = struct.name;
    const pieces: string[] = ["'{'"];
    struct.fields.forEach((f, i) => {
      const sep = i === 0 ? "" : ",";
      pieces.push(`'${sep}"${f.name}":' .. encode(self.${f.name})`);
    });
    pieces.push("'}'");
    const concatBody = pieces.map((p) => `    ${p},`).join("\n");
    return [
      `function ${name}.toJsonString(self)`,
      `  local function encode(v)`,
      `    local t = type(v)`,
      `    if t == "string" then`,
      `      local escaped = v:gsub("\\\\", "\\\\\\\\"):gsub('"', '\\\\"')`,
      `      return '"' .. escaped .. '"'`,
      `    elseif t == "number" or t == "boolean" then`,
      `      return tostring(v)`,
      `    elseif v == nil then`,
      `      return "null"`,
      `    else`,
      `      error("JsonString: unsupported field type " .. t)`,
      `    end`,
      `  end`,
      `  return table.concat({`,
      concatBody,
      `  })`,
      `end`,
    ].join("\n");
  },
};

/**
 * `#[email]` — field constraint that checks a string field matches a
 * basic email pattern (`<local>@<domain>.<tld>`).
 *
 * Uses Lua's built-in pattern syntax (not full PCRE). Good enough to
 * reject obviously malformed addresses; not a substitute for RFC 5322.
 */
const CONSTRAINT_EMAIL: FieldConstraintMacro = {
  kind: "field-constraint",
  name: "email",
  emit(_ctx, { struct, field }) {
    return [
      `if type(data.${field.name}) ~= "string" or not string.match(data.${field.name}, "^[%w._%%+-]+@[%w.-]+%.[%a]+$") then error("${struct.name}.${field.name}: expected a valid email address") end`,
    ];
  },
};

const macros: Macro[] = [DERIVE_JSON_STRING, CONSTRAINT_EMAIL];
export default macros;
