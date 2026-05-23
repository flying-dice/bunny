; Tree-sitter highlight queries for tsb. We piggyback on the
; tree-sitter-typescript grammar — most of the queries are standard TS
; patterns; the tsb-specific bits (struct, impl, trait, match) match
; bare identifiers in the right positions.

; ---- keywords --------------------------------------------------------------

[
  "import"
  "from"
  "export"
  "default"
  "as"
  "return"
  "if"
  "else"
  "for"
  "while"
  "do"
  "break"
  "continue"
  "switch"
  "case"
  "throw"
  "try"
  "catch"
  "finally"
  "new"
  "delete"
  "typeof"
  "instanceof"
  "in"
  "of"
  "void"
  "yield"
  "await"
  "async"
  "function"
  "class"
  "extends"
  "implements"
  "interface"
  "type"
  "enum"
  "namespace"
  "module"
  "declare"
  "public"
  "private"
  "protected"
  "readonly"
  "static"
  "abstract"
  "const"
  "let"
  "var"
] @keyword

; tsb-specific keywords surface as plain identifiers in the TS grammar;
; match them by name in declaration positions.
((identifier) @keyword
  (#match? @keyword "^(struct|impl|trait|match|for|Self)$"))

; ---- types -----------------------------------------------------------------

(type_identifier) @type
(predefined_type) @type.builtin

[
  "boolean"
  "number"
  "string"
  "any"
  "unknown"
  "never"
  "void"
  "null"
  "undefined"
] @type.builtin

; ---- declarations ----------------------------------------------------------

(function_declaration
  name: (identifier) @function)

(function_signature
  name: (identifier) @function)

(method_definition
  name: (property_identifier) @function.method)

(call_expression
  function: (identifier) @function.call)

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method.call))

(class_declaration
  name: (type_identifier) @type)

(interface_declaration
  name: (type_identifier) @type)

(type_alias_declaration
  name: (type_identifier) @type)

(enum_declaration
  name: (identifier) @type)

; ---- properties / variables ------------------------------------------------

(property_identifier) @property

(variable_declarator
  name: (identifier) @variable)

(formal_parameters
  (required_parameter (identifier) @variable.parameter))

(formal_parameters
  (optional_parameter (identifier) @variable.parameter))

; ---- literals --------------------------------------------------------------

[
  (string)
  (string_fragment)
] @string

(template_string) @string.special

(escape_sequence) @string.escape

(number) @number

[
  (true)
  (false)
] @boolean

(null) @constant.builtin
(undefined) @constant.builtin

; ---- comments --------------------------------------------------------------

(comment) @comment

; ---- punctuation -----------------------------------------------------------

[
  ";"
  ","
  "."
] @punctuation.delimiter

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

; ---- operators -------------------------------------------------------------

[
  "="
  "=="
  "==="
  "!="
  "!=="
  "<"
  ">"
  "<="
  ">="
  "+"
  "-"
  "*"
  "/"
  "%"
  "&&"
  "||"
  "!"
  "?"
  ":"
  "=>"
  "..."
] @operator

; ---- tsb attribute macros — `#[name(...)]` -------------------------------

; The TS grammar doesn't know about `#[...]`. The `#` parses as a hash
; token; the `[...]` parses as an array. We highlight the leading
; identifier inside via a name match below if it ever lands in this
; position. For full coverage we'd need a custom grammar — until then,
; the macro attribute lines still render readably as decorators.
