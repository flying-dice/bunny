; Tree-sitter highlight queries for the from-scratch neoc grammar.
; Every node referenced here exists in `grammar.js` — no ERROR-
; recovery hacks. Last matching query wins per node.

; ---- general identifiers + properties (catch-all) -----------------------

(identifier) @variable
(type_identifier) @type

; ---- keywords -----------------------------------------------------------

[
  "import" "from" "pub" "as" "type"
  "let" "const" "return" "if" "else"
  "struct" "impl" "trait" "match" "for"
  "fn" "ext" "async" "await"
] @keyword

(self_type) @keyword

; ---- types --------------------------------------------------------------

(primitive_type) @type.builtin
(named_type (type_identifier) @type)
(generic_type name: (type_identifier) @type)
(type_parameter name: (type_identifier) @type)
(self_type) @type.builtin

; ---- declarations -------------------------------------------------------

(struct_declaration name: (type_identifier) @type)
(tuple_struct_declaration name: (type_identifier) @type)
(impl_declaration first: (type_identifier) @type)
(impl_declaration target: (type_identifier) @type)
(trait_declaration name: (type_identifier) @type)
(type_alias name: (type_identifier) @type)

(function_declaration name: (identifier) @function)
(impl_method name: (identifier) @function.method)
(trait_method name: (identifier) @function.method)
(struct_field name: (identifier) @property)

; ---- expressions --------------------------------------------------------

(call_expression
  function: (identifier) @function.call)

(call_expression
  function: (member_expression
    property: (identifier) @function.method.call))

(member_expression property: (identifier) @property)

(formal_parameter name: (identifier) @variable.parameter)
(variable_declaration name: (identifier) @variable)

(object_property key: (identifier) @property)
(property_signature name: (identifier) @property)

; ---- try (postfix `?`) -------------------------------------------------

(try_expression "?" @operator)

; ---- range (`..` / `..=`) ----------------------------------------------

(range_expression ".." @operator)
(range_expression "..=" @operator)

; ---- match patterns -----------------------------------------------------

(struct_pattern name: (type_identifier) @type)
(pattern_check key: (identifier) @property)
(pattern_bind key: (identifier) @property)
(pattern_bind binding: (identifier) @variable)
(pattern_shorthand (identifier) @variable)
(binding_pattern) @variable
(wildcard_pattern) @keyword

; ---- attributes ---------------------------------------------------------

(attribute "#" @attribute)
(attribute "[" @attribute)
(attribute "]" @attribute)
(attribute_item name: (identifier) @attribute)
(attribute_call name: (identifier) @attribute)

; ---- literals -----------------------------------------------------------

(string) @string
(string_fragment_double) @string
(string_fragment_single) @string
(template_string) @string
(template_chars) @string
(escape_sequence) @string.escape
(number) @number
(boolean) @boolean
(null_literal) @constant.builtin
(undefined_literal) @constant.builtin

; ---- comments + structural --------------------------------------------

(line_comment) @comment
(block_comment) @comment

[";" "," "."] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket

[
  "="
  "==" "===" "!=" "!=="
  "<" ">" "<=" ">="
  "+" "-" "*" "/" "%"
  "&&" "||" "??"
  "!" "?" ":"
  "=>" "..." "?." "."
] @operator
