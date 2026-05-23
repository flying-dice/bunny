/**
 * Model types for the tsb compiler. A `.tsb` source parses into a `Module`
 * which is a flat ordered list of `ModulePart`s. Anything bunny doesn't
 * recognise as a struct/impl/function declaration is `OpaqueText` —
 * forwarded verbatim to the output. Recognised declarations carry their
 * attributes so macros can operate on them.
 */

export interface Span {
  /** Byte offset (inclusive) into the source. */
  start: number;
  /** Byte offset (exclusive) into the source. */
  end: number;
}

export interface Attr {
  /** `derive` in `#[derive(Clone, Equals)]`. */
  name: string;
  /** Raw text between the parens; empty when the attribute has no args. */
  args: string;
  /**
   * Parsed comma-separated args. String literals are unquoted (`"foo"`
   * → `foo`). Nested calls and identifiers pass through verbatim.
   */
  argList: string[];
  span: Span;
}

export interface OpaqueText {
  kind: "opaque";
  text: string;
  span: Span;
}

export interface StructField {
  name: string;
  /** Verbatim TS text for the field's declared type. */
  type: string;
  optional: boolean;
  attrs: Attr[];
  span: Span;
}

export interface StructDecl {
  kind: "struct";
  name: string;
  exported: boolean;
  /** Verbatim text of the generic parameter list, e.g. `<T, U>`. Empty when none. */
  generics: string;
  fields: StructField[];
  /** Attributes attached to the struct declaration itself. */
  attrs: Attr[];
  span: Span;
}

export interface ImplMethod {
  name: string;
  /** Verbatim text from the opening `(` to the end of the return type (just before the body `{`). */
  signature: string;
  /** Verbatim text of the params, *excluding* the surrounding parens. */
  params: string;
  /** Return type text (without the leading `:`). Empty when none. */
  returnType: string;
  /** Verbatim method body, *including* the surrounding braces. */
  body: string;
  attrs: Attr[];
  isAsync: boolean;
  span: Span;
}

export interface ImplDecl {
  kind: "impl";
  /**
   * The target struct name. For an inherent impl `impl Foo { … }` this
   * is `Foo`. For a trait impl `impl Trait<Args> for Foo { … }` this is
   * still `Foo` — the methods land on `Foo`'s const.
   */
  name: string;
  /** True iff the source wrote `export impl …`. */
  exported: boolean;
  /**
   * For trait impls (`impl Trait<Args> for Foo`), the trait name (e.g.
   * `From`). Undefined for inherent impls.
   */
  traitName?: string;
  /**
   * For trait impls, the generic argument list verbatim (e.g. `<string>`).
   * Undefined or empty when the trait takes no args.
   */
  traitArgs?: string;
  methods: ImplMethod[];
  attrs: Attr[];
  span: Span;
}

/**
 * A trait declaration. Method signatures without a body are required
 * implementations; methods with a body are defaults that `impl Trait
 * for Foo` blocks inherit unless overridden.
 *
 * The trait body uses `Self` as a placeholder for the implementing
 * type; the emitter substitutes it at impl time.
 */
export interface TraitDecl {
  kind: "trait";
  name: string;
  exported: boolean;
  /** Verbatim generic parameter list (`<T, U>`); empty when none. */
  generics: string;
  methods: TraitMethod[];
  attrs: Attr[];
  span: Span;
}

export interface TraitMethod {
  name: string;
  /** Verbatim text from the opening `(` to the end of the return type. */
  signature: string;
  /** Verbatim params, excluding the surrounding parens. */
  params: string;
  /** Return type (without the leading `:`). Empty when none. */
  returnType: string;
  /**
   * Default-method body including the surrounding braces, or
   * `undefined` when the method is signature-only (required).
   */
  body: string | undefined;
  attrs: Attr[];
  isAsync: boolean;
  span: Span;
}

/**
 * An enum declaration — Rust's tagged-union ADT. Each variant is either
 * a *unit* (just a name) or a *struct* variant (a name with named
 * fields). Tuple variants (`BadNumber(string)`) aren't in v1; use
 * struct fields with a single key instead.
 *
 *   enum CalcError {
 *     BadNumber { input: string },
 *     UnknownOp { op: string },
 *     DivByZero,
 *   }
 */
export interface EnumDecl {
  kind: "enum";
  name: string;
  exported: boolean;
  generics: string;
  variants: EnumVariant[];
  attrs: Attr[];
  span: Span;
}

export interface EnumVariant {
  name: string;
  /** Empty for unit variants. */
  fields: StructField[];
  span: Span;
}

export interface FunctionDecl {
  kind: "function";
  name: string;
  exported: boolean;
  signature: string;
  params: string;
  returnType: string;
  body: string;
  attrs: Attr[];
  isAsync: boolean;
  span: Span;
}

export type ModulePart =
  | OpaqueText
  | StructDecl
  | ImplDecl
  | TraitDecl
  | EnumDecl
  | FunctionDecl;

export interface Module {
  parts: ModulePart[];
  /** Source the model was parsed from — used for diagnostics. */
  source: string;
}

export interface ParseDiagnostic {
  message: string;
  span: Span;
}

export interface ParseResult {
  module: Module;
  diagnostics: ParseDiagnostic[];
}
