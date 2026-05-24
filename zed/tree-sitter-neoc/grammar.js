/**
 * neoc tree-sitter grammar — defined from scratch, not a fork.
 *
 * Build incrementally, one phase at a time. Every phase has corpus
 * tests under `test/corpus/`; `tree-sitter test` is the feedback
 * loop. Run `npm test` (or `tree-sitter test`) after each change.
 *
 * Current scope:
 *   - Phase 1: source file, comments, identifiers, literals.
 *
 * Pending (see corpus stubs):
 *   - Phase 2: imports / exports.
 *   - Phase 3: type expressions.
 *   - Phase 4: value expressions.
 *   - Phase 5: statements.
 *   - Phase 6: declarations (struct, impl, trait, function, type alias).
 *   - Phase 7: neoc-specific (#[…] attributes, match, Self, patterns).
 */

module.exports = grammar({
  name: 'neoc',

  // Tokens that may appear anywhere between other tokens without
  // forming nodes in the parse tree.
  extras: $ => [
    /\s+/,
    $.line_comment,
    $.block_comment,
  ],

  // Identifier-shaped tokens that should be locked out from matching
  // bare identifiers — they're keywords.
  word: $ => $.identifier,

  // GLR-resolved ambiguities. Whichever branch leads to a complete
  // parse wins.
  conflicts: $ => [
    // `(x)` could be either a parenthesised identifier or the
    // parameter list of an arrow function — only the `=>` (or its
    // absence) afterwards disambiguates.
    [$._right_expression, $.formal_parameter],
    // `x => {}` could either be an arrow with an empty object body
    // or an arrow with an empty statement block. Disambiguating
    // requires looking at what's inside the braces; trees-sitter
    // wants the GLR hint.
    [$.object_literal, $.statement_block],
    // `foo?` could either be a try_expression or the start of a
    // ternary `foo ? a : b`. GLR picks whichever leads to a complete
    // parse — when no `:` follows, try wins. The unary / binary
    // operators join the conflict because reaching the trailing `?`
    // crosses their inner `_right_expression` branch.
    [$.try_expression, $.ternary_expression, $.unary_expression],
    [$.try_expression, $.ternary_expression, $.binary_expression],
    // `a..b?` — the inner `b?` could either close out a range or join
    // a ternary. Try wins inside the right end of a range; the GLR
    // engine picks whichever leads to a complete parse.
    [$.try_expression, $.range_expression, $.ternary_expression],
    // `Foo { x } if x => …` — the guard expression and the arm's `=>`
    // overlap with arrow_function's `identifier => body` form. The
    // arm boundary always wins: the `=>` after a guard belongs to the
    // arm, not an arrow inside it.
    [$._right_expression, $.arrow_function],
  ],

  rules: {
    // ----- root -------------------------------------------------------

    source_file: $ => repeat($._statement),

    // Statements grow with each phase.
    _statement: $ => choice(
      $.import_statement,
      $.export_statement,
      $.type_alias,
      $.attributed_declaration,
      $.function_declaration,
      $.extern_function_declaration,
      $.struct_declaration,
      $.tuple_struct_declaration,
      $.impl_declaration,
      $.trait_declaration,
      $.return_statement,
      $.variable_declaration,
      $.if_statement,
      $.for_statement,
      $.while_statement,
      $.break_statement,
      $.continue_statement,
      $.statement_block,
      seq($._expression, ';'),
    ),

    // ----- attributes -----------------------------------------------

    // `#[a, b(x), c("y", 1)]` — one bracket block holds one or more
    // comma-separated attribute items. Each item is a name plus
    // optional call-shaped arguments. Multiple bracket blocks can
    // stack on a declaration.
    attribute: $ => seq(
      '#',
      '[',
      commaSep1($.attribute_item),
      ']',
    ),

    attribute_item: $ => seq(
      field('name', $.identifier),
      optional(field('arguments', $.attribute_arguments)),
    ),

    attribute_arguments: $ => seq(
      '(',
      commaSep($._attribute_value),
      ')',
    ),

    _attribute_value: $ => choice(
      $.string,
      $.number,
      $.boolean,
      $.identifier,
      $.attribute_call,
    ),

    // Nested call inside attribute args — supports patterns like
    // `#[default(SomeFactory())]`.
    attribute_call: $ => seq(
      field('name', $.identifier),
      '(',
      commaSep($._attribute_value),
      ')',
    ),

    attributed_declaration: $ => seq(
      repeat1($.attribute),
      choice(
        $.struct_declaration,
        $.impl_declaration,
        $.trait_declaration,
        $.function_declaration,
      ),
    ),

    // ----- top-level declarations -----------------------------------

    function_declaration: $ => seq(
      optional('pub'),
      optional('async'),
      'fn',
      field('name', $.identifier),
      optional(field('generics', $.type_parameters)),
      field('parameters', $.arrow_parameters),
      optional(seq('->', field('return_type', $._type))),
      field('body', $.statement_block),
    ),

    // Signature-only function declaration. Names a function provided by
    // the runtime (or another module's hand-written binding). The
    // compiler emits no Lua for it — it exists purely so inference
    // and the LSP can name-resolve and type-check calls to runtime
    // intrinsics. Terminate with `;`, no body allowed.
    extern_function_declaration: $ => seq(
      optional('pub'),
      'ext',
      'fn',
      field('name', $.identifier),
      optional(field('generics', $.type_parameters)),
      field('parameters', $.arrow_parameters),
      optional(seq('->', field('return_type', $._type))),
      ';',
    ),

    struct_declaration: $ => seq(
      optional('pub'),
      'struct',
      field('name', $.type_identifier),
      optional(field('generics', $.type_parameters)),
      field('body', $.struct_body),
    ),

    // Rust-style newtype shorthand: `struct ProductId(string)` desugars
    // to a single-field struct named `value`. No attribute slots on the
    // field — use the block form when constraints are needed.
    tuple_struct_declaration: $ => seq(
      optional('pub'),
      'struct',
      field('name', $.type_identifier),
      '(',
      field('tuple_type', $._type),
      ')',
    ),

    struct_body: $ => seq(
      '{',
      commaSep($.struct_field),
      '}',
    ),

    struct_field: $ => seq(
      repeat($.attribute),
      field('name', $.identifier),
      optional('?'),
      ':',
      field('type', $._type),
    ),

    impl_declaration: $ => seq(
      optional('pub'),
      'impl',
      // Two forms:
      //   impl <Target>                 ← inherent
      //   impl <Trait>[<args>] for <Target>  ← trait impl
      field('first', $.type_identifier),
      optional(field('trait_args', $.type_arguments)),
      optional(seq('for', field('target', $.type_identifier))),
      field('body', $.impl_body),
    ),

    impl_body: $ => seq(
      '{',
      repeat($.impl_method),
      '}',
    ),

    impl_method: $ => seq(
      repeat($.attribute),
      optional('async'),
      field('name', $.identifier),
      optional(field('generics', $.type_parameters)),
      field('parameters', $.arrow_parameters),
      optional(seq('->', field('return_type', $._type))),
      field('body', $.statement_block),
    ),

    trait_declaration: $ => seq(
      optional('pub'),
      'trait',
      field('name', $.type_identifier),
      optional(field('generics', $.type_parameters)),
      field('body', $.trait_body),
    ),

    trait_body: $ => seq(
      '{',
      repeat($.trait_method),
      '}',
    ),

    trait_method: $ => seq(
      optional('async'),
      field('name', $.identifier),
      optional(field('generics', $.type_parameters)),
      field('parameters', $.arrow_parameters),
      optional(seq('->', field('return_type', $._type))),
      // Required signature ends in `;`; default method has a body.
      choice(';', field('body', $.statement_block)),
    ),

    return_statement: $ => seq(
      'return',
      optional($._expression),
      ';',
    ),

    variable_declaration: $ => seq(
      choice('let', 'const'),
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expression))),
      // Trailing `;` is optional — newlines terminate the statement.
      // Without this, tree-sitter's error recovery would extend the
      // declaration's span across line breaks into the next statement,
      // and lowerings like `?` would splice over code that should run.
      optional(';'),
    ),

    if_statement: $ => prec.right(seq(
      'if',
      '(',
      field('condition', $._expression),
      ')',
      field('consequence', $._statement),
      optional(seq('else', field('alternative', $._statement))),
    )),

    // Rust-style `for name in iterable { body }`. The iterable is any
    // expression that produces a sequence — typically a range
    // (`0..10`), an array literal, or a value bound to one — and the
    // body is always a `statement_block` so `break` / `continue` have
    // an unambiguous loop to attach to.
    for_statement: $ => seq(
      'for',
      field('name', $.identifier),
      'in',
      field('iterable', $._expression),
      field('body', $.statement_block),
    ),

    // `while (cond) body` — parens match `if` for visual consistency.
    while_statement: $ => prec.right(seq(
      'while',
      '(',
      field('condition', $._expression),
      ')',
      field('body', $._statement),
    )),

    break_statement: $ => seq('break', optional(';')),
    continue_statement: $ => seq('continue', optional(';')),

    // ----- type expressions -----------------------------------------

    type_alias: $ => seq(
      optional('pub'),
      'type',
      field('name', $.type_identifier),
      optional($.type_parameters),
      '=',
      field('value', $._type),
      ';',
    ),

    _type: $ => choice(
      $.union_type,
      $._primary_type,
    ),

    union_type: $ => prec.left(1, seq(
      $._primary_type,
      repeat1(seq('|', $._primary_type)),
    )),

    _primary_type: $ => choice(
      $.primitive_type,
      $.generic_type,
      $.named_type,
      $.array_type,
      $.tuple_type,
      $.function_type,
      $.object_type,
      $.string,
      $.number,
      $.boolean,
      $.null_literal,
      $.undefined_literal,
      $.self_type,
    ),

    primitive_type: $ => choice(
      // Lua-aligned primitives, named the way Rust does where the names line up.
      // `number` covers all numeric values (Lua has no int/float split).
      'string', 'number', 'bool', 'table', 'void',
    ),

    named_type: $ => $.type_identifier,

    // `Self` is a reserved type token in neoc. The bare literal
    // string lets tree-sitter's reserved-word machinery exclude
    // `Self` from `type_identifier` matches automatically.
    self_type: $ => 'Self',

    generic_type: $ => seq(
      field('name', $.type_identifier),
      field('arguments', $.type_arguments),
    ),

    type_arguments: $ => seq(
      '<',
      commaSep1($._type),
      '>',
    ),

    array_type: $ => prec(2, seq(
      $._primary_type,
      '[',
      ']',
    )),

    tuple_type: $ => seq(
      '[',
      commaSep($._type),
      ']',
    ),

    function_type: $ => prec.right(seq(
      '(',
      commaSep($.type_parameter_decl),
      ')',
      '=>',
      $._type,
    )),

    // Used inside `(a: T, b: T) => U` function-type parameter lists.
    // Distinct from `type_parameters` (which is the `<T, U>` generic
    // declaration list) — kept separate to keep highlighting clean.
    type_parameter_decl: $ => seq(
      field('name', $.identifier),
      optional('?'),
      ':',
      field('type', $._type),
    ),

    object_type: $ => seq(
      '{',
      repeat(seq(
        $.property_signature,
        choice(',', ';'),
      )),
      optional($.property_signature),
      '}',
    ),

    property_signature: $ => seq(
      optional('readonly'),
      field('name', $.identifier),
      optional('?'),
      ':',
      field('type', $._type),
    ),

    // Generic declaration list — used by structs, traits, type aliases:
    //   `struct Map<K, V> { … }`
    type_parameters: $ => seq(
      '<',
      commaSep1($.type_parameter),
      '>',
    ),

    type_parameter: $ => seq(
      field('name', $.type_identifier),
      optional(seq('extends', $._type)),
      optional(seq('=', $._type)),
    ),

    // Lower lexer precedence than literal keyword tokens like `Self`
    // so the bare token `Self` always wins as `self_type`.
    type_identifier: $ => token(prec(-1, /[A-Z][A-Za-z0-9_]*/)),

    // ----- imports / exports -----------------------------------------

    import_statement: $ => seq(
      'import',
      optional('type'),
      $.import_clause,
      'from',
      field('source', $.string),
      ';',
    ),

    import_clause: $ => choice(
      $.named_imports,
      $.namespace_import,
      seq(
        field('default', $.identifier),
        optional(seq(',', $.named_imports)),
      ),
    ),

    named_imports: $ => seq(
      '{',
      commaSep($.import_specifier),
      optional(','),
      '}',
    ),

    namespace_import: $ => seq(
      '*',
      'as',
      $.identifier,
    ),

    import_specifier: $ => seq(
      optional('type'),
      field('name', $.identifier),
      optional(seq('as', field('alias', $.identifier))),
    ),

    export_statement: $ => choice(
      // re-export: `export { x } from "..."` / `export * from "..."`
      seq(
        'export',
        choice(
          $.named_imports,
          seq('*', optional(seq('as', $.identifier))),
        ),
        'from',
        field('source', $.string),
        ';',
      ),
      // plain bare re-export: `export { x };`
      seq(
        'export',
        $.named_imports,
        ';',
      ),
    ),

    // ----- expressions -----------------------------------------------

    _expression: $ => choice(
      $.assignment_expression,
      $._right_expression,
    ),

    // "Right-hand" expressions: anything that can appear on the RHS
    // of an assignment, in an argument position, etc.
    _right_expression: $ => choice(
      $.match_expression,
      $.ternary_expression,
      $.try_expression,
      $.range_expression,
      $.binary_expression,
      $.unary_expression,
      $.call_expression,
      $.member_expression,
      $.subscript_expression,
      $.parenthesised_expression,
      $.arrow_function,
      $.array_literal,
      $.object_literal,
      $.block_expression,
      $.template_string,
      $.identifier,
      $.number,
      $.string,
      $.boolean,
      $.null_literal,
      $.undefined_literal,
    ),

    // ----- block expression ----------------------------------------
    //
    // Rust-style `{ stmt; stmt; final-expression }` — a brace-wrapped
    // sequence of statements whose final, terminator-less expression
    // is the value the block evaluates to. Lowering wraps it in a
    // Lua IIFE so it stays an expression in the target. The form
    // requires at least one statement so that bare `{ x = v, y = v }`
    // tables written in opaque Lua bodies don't accidentally match —
    // those have no `;` and no leading statement, so they parse as
    // object_literal (when shaped like one) or fall through to an
    // ERROR. Lower precedence than object_literal keeps `{ a: 1 }`
    // parsing as an object.
    block_expression: $ => prec(-1, seq(
      '{',
      repeat1($._statement),
      field('final', $._expression),
      '}',
    )),

    // ----- try (postfix `?`) expression -----------------------------
    //
    // `expr?` — Rust-style early-return on `Err`. Binds tighter than
    // the ternary `cond ? then : else` so that `foo()? : bar` always
    // parses as a try followed by a syntax error rather than an
    // ambiguous ternary. Tree-sitter's GLR still tries the ternary
    // branch when a `:` follows; the precedence below tips the
    // decision toward `try_expression` whenever the trailing `:` is
    // absent.
    try_expression: $ => prec(12, seq(
      $._right_expression,
      '?',
    )),

    // ----- range expression -----------------------------------------
    //
    // `start..end`  — exclusive on the right (Rust convention).
    // `start..=end` — inclusive on the right.
    //
    // Sits below comparison (6) but above arithmetic (7) so
    // `a + 1 .. b * 2` parses as `(a + 1)..(b * 2)`.
    range_expression: $ => prec.left(4, seq(
      field('start', $._right_expression),
      field('op', choice('..', '..=')),
      field('end', $._right_expression),
    )),

    // ----- match expression -----------------------------------------

    match_expression: $ => seq(
      'match',
      field('scrutinee', $._right_expression),
      '{',
      commaSep($.match_arm),
      '}',
    ),

    match_arm: $ => seq(
      field('pattern', $._pattern),
      optional(seq('if', field('guard', $._expression))),
      '=>',
      field('body', $._expression),
    ),

    _pattern: $ => choice(
      $.wildcard_pattern,
      $.struct_pattern,
      $.object_pattern,
      $.literal_pattern,
      $.binding_pattern,
    ),

    wildcard_pattern: $ => '_',

    // PascalCase identifier — optionally followed by a struct-shaped
    // body of field bindings. `BadNumber { input }` matches when the
    // scrutinee carries the BadNumber brand and binds `input`.
    struct_pattern: $ => seq(
      field('name', $.type_identifier),
      optional(field('body', $.pattern_body)),
    ),

    // Plain object pattern — for matching unbranded discriminated
    // unions like Result. `{ ok: true, value }` checks `ok === true`
    // and binds `value`.
    object_pattern: $ => $.pattern_body,

    pattern_body: $ => seq(
      '{',
      commaSep($._pattern_entry),
      '}',
    ),

    _pattern_entry: $ => choice(
      $.pattern_check,
      $.pattern_bind,
      $.pattern_shorthand,
    ),

    pattern_check: $ => seq(
      field('key', $.identifier),
      ':',
      field('value', choice($.string, $.number, $.boolean, $.null_literal, $.undefined_literal)),
    ),

    pattern_bind: $ => seq(
      field('key', $.identifier),
      ':',
      field('binding', $.identifier),
    ),

    pattern_shorthand: $ => $.identifier,

    literal_pattern: $ => choice(
      $.string,
      $.number,
      $.boolean,
      $.null_literal,
      $.undefined_literal,
    ),

    // A camelCase-style identifier binds the whole scrutinee for the
    // arm. PascalCase identifiers are reserved for struct patterns
    // (see `struct_pattern` above) — so the lexer needs a separate
    // token kind for them. Lower lexer precedence on the regex so
    // any literal keyword wins ties.
    binding_pattern: $ => $._camel_identifier,

    _camel_identifier: $ => token(prec(-1, /[a-z_$][A-Za-z0-9_$]*/)),

    assignment_expression: $ => prec.right(1, seq(
      field('left', choice($.identifier, $.member_expression, $.subscript_expression)),
      choice('=', '+=', '-=', '*=', '/=', '%=', '||=', '&&=', '??='),
      field('right', $._expression),
    )),

    ternary_expression: $ => prec.right(2, seq(
      field('cond', $._right_expression),
      '?',
      field('then', $._right_expression),
      ':',
      field('else', $._right_expression),
    )),

    binary_expression: $ => choice(
      prec.left(3, seq($._right_expression, '||', $._right_expression)),
      prec.left(3, seq($._right_expression, '??', $._right_expression)),
      prec.left(4, seq($._right_expression, '&&', $._right_expression)),
      prec.left(5, seq($._right_expression, choice('==', '!=', '===', '!=='), $._right_expression)),
      prec.left(6, seq($._right_expression, choice('<', '>', '<=', '>='), $._right_expression)),
      prec.left(7, seq($._right_expression, choice('+', '-'), $._right_expression)),
      prec.left(8, seq($._right_expression, choice('*', '/', '%'), $._right_expression)),
    ),

    unary_expression: $ => prec(9, seq(
      choice('!', '-', '+', 'typeof', 'await', '...'),
      $._right_expression,
    )),

    call_expression: $ => prec(10, seq(
      field('function', $._right_expression),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq(
      '(',
      commaSep($._expression),
      ')',
    ),

    member_expression: $ => prec(11, seq(
      field('object', $._right_expression),
      choice('.', '?.'),
      field('property', $.identifier),
    )),

    subscript_expression: $ => prec(11, seq(
      field('object', $._right_expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    parenthesised_expression: $ => seq(
      '(',
      $._expression,
      ')',
    ),

    arrow_function: $ => prec.right(seq(
      field('parameters', choice(
        $.identifier,
        $.arrow_parameters,
      )),
      '=>',
      field('body', choice(
        $._expression,
        $.statement_block,
      )),
    )),

    arrow_parameters: $ => seq(
      '(',
      commaSep($.formal_parameter),
      ')',
    ),

    formal_parameter: $ => seq(
      field('name', $.identifier),
      optional('?'),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('default', $._expression))),
    ),

    array_literal: $ => seq(
      '[',
      commaSep($._expression),
      ']',
    ),

    object_literal: $ => seq(
      '{',
      commaSep(choice(
        $.object_property,
        $.shorthand_property,
        $.spread_element,
      )),
      '}',
    ),

    object_property: $ => seq(
      field('key', choice($.identifier, $.string, $.number)),
      ':',
      field('value', $._expression),
    ),

    shorthand_property: $ => $.identifier,

    spread_element: $ => seq('...', $._expression),

    template_string: $ => seq(
      '`',
      repeat(choice(
        $.template_chars,
        $.escape_sequence,
        $.template_substitution,
      )),
      '`',
    ),

    template_chars: $ => token.immediate(/[^`$\\]+/),

    template_substitution: $ => seq('${', $._expression, '}'),

    // Statement block — bodies of arrow functions, future
    // function/method bodies, etc.
    statement_block: $ => seq(
      '{',
      repeat($._statement),
      '}',
    ),

    // ----- lexical primitives -----------------------------------------

    identifier: $ => /[A-Za-z_$][A-Za-z0-9_$]*/,

    number: $ => token(choice(
      // hex / oct / bin
      /0[xX][0-9a-fA-F_]+/,
      /0[oO][0-7_]+/,
      /0[bB][01_]+/,
      // float / int with optional exponent
      /[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9_]+)?/,
      /\.[0-9_]+([eE][+-]?[0-9_]+)?/,
    )),

    string: $ => choice(
      $._double_string,
      $._single_string,
    ),

    _double_string: $ => seq(
      '"',
      repeat(choice(
        $.string_fragment_double,
        $.escape_sequence,
      )),
      '"',
    ),

    _single_string: $ => seq(
      "'",
      repeat(choice(
        $.string_fragment_single,
        $.escape_sequence,
      )),
      "'",
    ),

    string_fragment_double: $ => token.immediate(/[^"\\]+/),
    string_fragment_single: $ => token.immediate(/[^'\\]+/),

    escape_sequence: $ => token.immediate(seq(
      '\\',
      choice(
        /[^xu0-7]/,
        /[0-7]{1,3}/,
        /x[0-9a-fA-F]{2}/,
        /u[0-9a-fA-F]{4}/,
        /u\{[0-9a-fA-F]+\}/,
      ),
    )),

    boolean: $ => choice('true', 'false'),
    // `null` is a reserved node-name in tree-sitter query syntax —
    // can't be used as a rule name without breaking highlights.scm.
    null_literal: $ => 'null',
    undefined_literal: $ => 'undefined',

    // ----- comments ---------------------------------------------------

    line_comment: $ => token(seq('//', /[^\n]*/)),

    // ----- helpers (referenced by rules above) ----------------------

    block_comment: $ => token(seq(
      '/*',
      /[^*]*\*+([^/*][^*]*\*+)*/,
      '/',
    )),
  },
});

/** Comma-separated list (possibly empty). */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/** Comma-separated list with at least one element; trailing comma OK. */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}
