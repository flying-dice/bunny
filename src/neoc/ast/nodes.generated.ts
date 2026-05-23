// AUTO-GENERATED from zed/tree-sitter-neoc/src/node-types.json.
// Re-run `bun run src/neoc/ast/generate.ts` after any grammar change.

/** Source position (1-based row/column). */
export interface Point { row: number; column: number }

/** Byte span covering a syntax node. */
export interface Range { startIndex: number; endIndex: number; startPosition: Point; endPosition: Point }

/** Common fields every AST node carries. */
export interface NodeBase extends Range {
  /** Raw source text covered by the node — handy for opaque or
   *  literal nodes where we don't need a structured representation. */
  text: string;
}

/** Grammar node `arguments`. */
export interface ArgumentsNode extends NodeBase {
  kind: "arguments";
  children: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode)[];
}

/** Grammar node `array_literal`. */
export interface ArrayLiteralNode extends NodeBase {
  kind: "array_literal";
  children: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode)[];
}

/** Grammar node `array_type`. */
export interface ArrayTypeNode extends NodeBase {
  kind: "array_type";
  children: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode;
}

/** Grammar node `arrow_function`. */
export interface ArrowFunctionNode extends NodeBase {
  kind: "arrow_function";
  body: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StatementBlockNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  parameters: ArrowParametersNode | IdentifierNode;
}

/** Grammar node `arrow_parameters`. */
export interface ArrowParametersNode extends NodeBase {
  kind: "arrow_parameters";
  children: (FormalParameterNode)[];
}

/** Grammar node `assignment_expression`. */
export interface AssignmentExpressionNode extends NodeBase {
  kind: "assignment_expression";
  left: IdentifierNode | MemberExpressionNode | SubscriptExpressionNode;
  right: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `attribute`. */
export interface AttributeNode extends NodeBase {
  kind: "attribute";
  children: (AttributeItemNode)[];
}

/** Grammar node `attribute_arguments`. */
export interface AttributeArgumentsNode extends NodeBase {
  kind: "attribute_arguments";
  children: (AttributeCallNode | BooleanNode | IdentifierNode | NumberNode | StringNode)[];
}

/** Grammar node `attribute_call`. */
export interface AttributeCallNode extends NodeBase {
  kind: "attribute_call";
  name: IdentifierNode;
  children: (AttributeCallNode | BooleanNode | IdentifierNode | NumberNode | StringNode)[];
}

/** Grammar node `attribute_item`. */
export interface AttributeItemNode extends NodeBase {
  kind: "attribute_item";
  arguments?: AttributeArgumentsNode | undefined;
  name: IdentifierNode;
}

/** Grammar node `attributed_declaration`. */
export interface AttributedDeclarationNode extends NodeBase {
  kind: "attributed_declaration";
  children: (AttributeNode | FunctionDeclarationNode | ImplDeclarationNode | StructDeclarationNode | TraitDeclarationNode)[];
}

/** Grammar node `binary_expression`. */
export interface BinaryExpressionNode extends NodeBase {
  kind: "binary_expression";
  children: (ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode)[];
}

/** Grammar node `binding_pattern`. */
export interface BindingPatternNode extends NodeBase {
  kind: "binding_pattern";
}

/** Grammar node `block_expression`. */
export interface BlockExpressionNode extends NodeBase {
  kind: "block_expression";
  final: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  children: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | AttributedDeclarationNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | ExportStatementNode | FunctionDeclarationNode | IdentifierNode | IfStatementNode | ImplDeclarationNode | ImportStatementNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | ReturnStatementNode | StatementBlockNode | StringNode | StructDeclarationNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TraitDeclarationNode | TryExpressionNode | TupleStructDeclarationNode | TypeAliasNode | UnaryExpressionNode | UndefinedLiteralNode | VariableDeclarationNode)[];
}

/** Grammar node `boolean`. */
export interface BooleanNode extends NodeBase {
  kind: "boolean";
}

/** Grammar node `call_expression`. */
export interface CallExpressionNode extends NodeBase {
  kind: "call_expression";
  arguments: ArgumentsNode;
  function: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `export_statement`. */
export interface ExportStatementNode extends NodeBase {
  kind: "export_statement";
  source?: StringNode | undefined;
  children: IdentifierNode | NamedImportsNode | undefined;
}

/** Grammar node `formal_parameter`. */
export interface FormalParameterNode extends NodeBase {
  kind: "formal_parameter";
  default?: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode | undefined;
  name: IdentifierNode;
  type?: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode | undefined;
}

/** Grammar node `function_declaration`. */
export interface FunctionDeclarationNode extends NodeBase {
  kind: "function_declaration";
  body: StatementBlockNode;
  generics?: TypeParametersNode | undefined;
  name: IdentifierNode;
  parameters: ArrowParametersNode;
  return_type?: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode | undefined;
}

/** Grammar node `function_type`. */
export interface FunctionTypeNode extends NodeBase {
  kind: "function_type";
  children: (ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | TypeParameterDeclNode | UndefinedLiteralNode | UnionTypeNode)[];
}

/** Grammar node `generic_type`. */
export interface GenericTypeNode extends NodeBase {
  kind: "generic_type";
  arguments: TypeArgumentsNode;
  name: TypeIdentifierNode;
}

/** Grammar node `if_statement`. */
export interface IfStatementNode extends NodeBase {
  kind: "if_statement";
  alternative?: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | AttributedDeclarationNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | ExportStatementNode | FunctionDeclarationNode | IdentifierNode | IfStatementNode | ImplDeclarationNode | ImportStatementNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | ReturnStatementNode | StatementBlockNode | StringNode | StructDeclarationNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TraitDeclarationNode | TryExpressionNode | TupleStructDeclarationNode | TypeAliasNode | UnaryExpressionNode | UndefinedLiteralNode | VariableDeclarationNode)[];
  condition: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  consequence: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | AttributedDeclarationNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | ExportStatementNode | FunctionDeclarationNode | IdentifierNode | IfStatementNode | ImplDeclarationNode | ImportStatementNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | ReturnStatementNode | StatementBlockNode | StringNode | StructDeclarationNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TraitDeclarationNode | TryExpressionNode | TupleStructDeclarationNode | TypeAliasNode | UnaryExpressionNode | UndefinedLiteralNode | VariableDeclarationNode)[];
}

/** Grammar node `impl_body`. */
export interface ImplBodyNode extends NodeBase {
  kind: "impl_body";
  children: (ImplMethodNode)[];
}

/** Grammar node `impl_declaration`. */
export interface ImplDeclarationNode extends NodeBase {
  kind: "impl_declaration";
  body: ImplBodyNode;
  first: TypeIdentifierNode;
  target?: TypeIdentifierNode | undefined;
  trait_args?: TypeArgumentsNode | undefined;
}

/** Grammar node `impl_method`. */
export interface ImplMethodNode extends NodeBase {
  kind: "impl_method";
  body: StatementBlockNode;
  generics?: TypeParametersNode | undefined;
  name: IdentifierNode;
  parameters: ArrowParametersNode;
  return_type?: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode | undefined;
  children: (AttributeNode)[];
}

/** Grammar node `import_clause`. */
export interface ImportClauseNode extends NodeBase {
  kind: "import_clause";
  default?: IdentifierNode | undefined;
  children: NamedImportsNode | NamespaceImportNode | undefined;
}

/** Grammar node `import_specifier`. */
export interface ImportSpecifierNode extends NodeBase {
  kind: "import_specifier";
  alias?: IdentifierNode | undefined;
  name: IdentifierNode;
}

/** Grammar node `import_statement`. */
export interface ImportStatementNode extends NodeBase {
  kind: "import_statement";
  source: StringNode;
  children: ImportClauseNode;
}

/** Grammar node `literal_pattern`. */
export interface LiteralPatternNode extends NodeBase {
  kind: "literal_pattern";
  children: BooleanNode | NullLiteralNode | NumberNode | StringNode | UndefinedLiteralNode;
}

/** Grammar node `match_arm`. */
export interface MatchArmNode extends NodeBase {
  kind: "match_arm";
  body: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  guard?: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode | undefined;
  pattern: BindingPatternNode | LiteralPatternNode | ObjectPatternNode | StructPatternNode | WildcardPatternNode;
}

/** Grammar node `match_expression`. */
export interface MatchExpressionNode extends NodeBase {
  kind: "match_expression";
  scrutinee: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  children: (MatchArmNode)[];
}

/** Grammar node `member_expression`. */
export interface MemberExpressionNode extends NodeBase {
  kind: "member_expression";
  object: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  property: IdentifierNode;
}

/** Grammar node `named_imports`. */
export interface NamedImportsNode extends NodeBase {
  kind: "named_imports";
  children: (ImportSpecifierNode)[];
}

/** Grammar node `named_type`. */
export interface NamedTypeNode extends NodeBase {
  kind: "named_type";
  children: TypeIdentifierNode;
}

/** Grammar node `namespace_import`. */
export interface NamespaceImportNode extends NodeBase {
  kind: "namespace_import";
  children: IdentifierNode;
}

/** Grammar node `object_literal`. */
export interface ObjectLiteralNode extends NodeBase {
  kind: "object_literal";
  children: (ObjectPropertyNode | ShorthandPropertyNode | SpreadElementNode)[];
}

/** Grammar node `object_pattern`. */
export interface ObjectPatternNode extends NodeBase {
  kind: "object_pattern";
  children: PatternBodyNode;
}

/** Grammar node `object_property`. */
export interface ObjectPropertyNode extends NodeBase {
  kind: "object_property";
  key: IdentifierNode | NumberNode | StringNode;
  value: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `object_type`. */
export interface ObjectTypeNode extends NodeBase {
  kind: "object_type";
  children: (PropertySignatureNode)[];
}

/** Grammar node `parenthesised_expression`. */
export interface ParenthesisedExpressionNode extends NodeBase {
  kind: "parenthesised_expression";
  children: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `pattern_bind`. */
export interface PatternBindNode extends NodeBase {
  kind: "pattern_bind";
  binding: IdentifierNode;
  key: IdentifierNode;
}

/** Grammar node `pattern_body`. */
export interface PatternBodyNode extends NodeBase {
  kind: "pattern_body";
  children: (PatternBindNode | PatternCheckNode | PatternShorthandNode)[];
}

/** Grammar node `pattern_check`. */
export interface PatternCheckNode extends NodeBase {
  kind: "pattern_check";
  key: IdentifierNode;
  value: BooleanNode | NullLiteralNode | NumberNode | StringNode | UndefinedLiteralNode;
}

/** Grammar node `pattern_shorthand`. */
export interface PatternShorthandNode extends NodeBase {
  kind: "pattern_shorthand";
  children: IdentifierNode;
}

/** Grammar node `primitive_type`. */
export interface PrimitiveTypeNode extends NodeBase {
  kind: "primitive_type";
}

/** Grammar node `property_signature`. */
export interface PropertySignatureNode extends NodeBase {
  kind: "property_signature";
  name: IdentifierNode;
  type: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode;
}

/** Grammar node `range_expression`. */
export interface RangeExpressionNode extends NodeBase {
  kind: "range_expression";
  end: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  op: NodeBase;
  start: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `return_statement`. */
export interface ReturnStatementNode extends NodeBase {
  kind: "return_statement";
  children: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode | undefined;
}

/** Grammar node `shorthand_property`. */
export interface ShorthandPropertyNode extends NodeBase {
  kind: "shorthand_property";
  children: IdentifierNode;
}

/** Grammar node `source_file`. */
export interface SourceFileNode extends NodeBase {
  kind: "source_file";
  children: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | AttributedDeclarationNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | ExportStatementNode | FunctionDeclarationNode | IdentifierNode | IfStatementNode | ImplDeclarationNode | ImportStatementNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | ReturnStatementNode | StatementBlockNode | StringNode | StructDeclarationNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TraitDeclarationNode | TryExpressionNode | TupleStructDeclarationNode | TypeAliasNode | UnaryExpressionNode | UndefinedLiteralNode | VariableDeclarationNode)[];
}

/** Grammar node `spread_element`. */
export interface SpreadElementNode extends NodeBase {
  kind: "spread_element";
  children: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `statement_block`. */
export interface StatementBlockNode extends NodeBase {
  kind: "statement_block";
  children: (ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | AttributedDeclarationNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | ExportStatementNode | FunctionDeclarationNode | IdentifierNode | IfStatementNode | ImplDeclarationNode | ImportStatementNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | ReturnStatementNode | StatementBlockNode | StringNode | StructDeclarationNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TraitDeclarationNode | TryExpressionNode | TupleStructDeclarationNode | TypeAliasNode | UnaryExpressionNode | UndefinedLiteralNode | VariableDeclarationNode)[];
}

/** Grammar node `string`. */
export interface StringNode extends NodeBase {
  kind: "string";
  children: (EscapeSequenceNode | StringFragmentDoubleNode | StringFragmentSingleNode)[];
}

/** Grammar node `struct_body`. */
export interface StructBodyNode extends NodeBase {
  kind: "struct_body";
  children: (StructFieldNode)[];
}

/** Grammar node `struct_declaration`. */
export interface StructDeclarationNode extends NodeBase {
  kind: "struct_declaration";
  body: StructBodyNode;
  generics?: TypeParametersNode | undefined;
  name: TypeIdentifierNode;
}

/** Grammar node `struct_field`. */
export interface StructFieldNode extends NodeBase {
  kind: "struct_field";
  name: IdentifierNode;
  type: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode;
  children: (AttributeNode)[];
}

/** Grammar node `struct_pattern`. */
export interface StructPatternNode extends NodeBase {
  kind: "struct_pattern";
  body?: PatternBodyNode | undefined;
  name: TypeIdentifierNode;
}

/** Grammar node `subscript_expression`. */
export interface SubscriptExpressionNode extends NodeBase {
  kind: "subscript_expression";
  index: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  object: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `template_string`. */
export interface TemplateStringNode extends NodeBase {
  kind: "template_string";
  children: (EscapeSequenceNode | TemplateCharsNode | TemplateSubstitutionNode)[];
}

/** Grammar node `template_substitution`. */
export interface TemplateSubstitutionNode extends NodeBase {
  kind: "template_substitution";
  children: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `ternary_expression`. */
export interface TernaryExpressionNode extends NodeBase {
  kind: "ternary_expression";
  cond: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  else: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
  then: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `trait_body`. */
export interface TraitBodyNode extends NodeBase {
  kind: "trait_body";
  children: (TraitMethodNode)[];
}

/** Grammar node `trait_declaration`. */
export interface TraitDeclarationNode extends NodeBase {
  kind: "trait_declaration";
  body: TraitBodyNode;
  generics?: TypeParametersNode | undefined;
  name: TypeIdentifierNode;
}

/** Grammar node `trait_method`. */
export interface TraitMethodNode extends NodeBase {
  kind: "trait_method";
  body?: StatementBlockNode | undefined;
  generics?: TypeParametersNode | undefined;
  name: IdentifierNode;
  parameters: ArrowParametersNode;
  return_type?: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode | undefined;
}

/** Grammar node `try_expression`. */
export interface TryExpressionNode extends NodeBase {
  kind: "try_expression";
  children: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `tuple_struct_declaration`. */
export interface TupleStructDeclarationNode extends NodeBase {
  kind: "tuple_struct_declaration";
  name: TypeIdentifierNode;
  tuple_type: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode;
}

/** Grammar node `tuple_type`. */
export interface TupleTypeNode extends NodeBase {
  kind: "tuple_type";
  children: (ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode)[];
}

/** Grammar node `type_alias`. */
export interface TypeAliasNode extends NodeBase {
  kind: "type_alias";
  name: TypeIdentifierNode;
  value: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode;
  children: TypeParametersNode | undefined;
}

/** Grammar node `type_arguments`. */
export interface TypeArgumentsNode extends NodeBase {
  kind: "type_arguments";
  children: (ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode)[];
}

/** Grammar node `type_parameter`. */
export interface TypeParameterNode extends NodeBase {
  kind: "type_parameter";
  name: TypeIdentifierNode;
  children: (ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode)[];
}

/** Grammar node `type_parameter_decl`. */
export interface TypeParameterDeclNode extends NodeBase {
  kind: "type_parameter_decl";
  name: IdentifierNode;
  type: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode;
}

/** Grammar node `type_parameters`. */
export interface TypeParametersNode extends NodeBase {
  kind: "type_parameters";
  children: (TypeParameterNode)[];
}

/** Grammar node `unary_expression`. */
export interface UnaryExpressionNode extends NodeBase {
  kind: "unary_expression";
  children: ArrayLiteralNode | ArrowFunctionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode;
}

/** Grammar node `union_type`. */
export interface UnionTypeNode extends NodeBase {
  kind: "union_type";
  children: (ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode)[];
}

/** Grammar node `variable_declaration`. */
export interface VariableDeclarationNode extends NodeBase {
  kind: "variable_declaration";
  name: IdentifierNode;
  type?: ArrayTypeNode | BooleanNode | FunctionTypeNode | GenericTypeNode | NamedTypeNode | NullLiteralNode | NumberNode | ObjectTypeNode | PrimitiveTypeNode | SelfTypeNode | StringNode | TupleTypeNode | UndefinedLiteralNode | UnionTypeNode | undefined;
  value?: ArrayLiteralNode | ArrowFunctionNode | AssignmentExpressionNode | BinaryExpressionNode | BlockExpressionNode | BooleanNode | CallExpressionNode | IdentifierNode | MatchExpressionNode | MemberExpressionNode | NullLiteralNode | NumberNode | ObjectLiteralNode | ParenthesisedExpressionNode | RangeExpressionNode | StringNode | SubscriptExpressionNode | TemplateStringNode | TernaryExpressionNode | TryExpressionNode | UnaryExpressionNode | UndefinedLiteralNode | undefined;
}

/** Grammar node `block_comment`. */
export interface BlockCommentNode extends NodeBase {
  kind: "block_comment";
}

/** Grammar node `escape_sequence`. */
export interface EscapeSequenceNode extends NodeBase {
  kind: "escape_sequence";
}

/** Grammar node `identifier`. */
export interface IdentifierNode extends NodeBase {
  kind: "identifier";
}

/** Grammar node `line_comment`. */
export interface LineCommentNode extends NodeBase {
  kind: "line_comment";
}

/** Grammar node `null_literal`. */
export interface NullLiteralNode extends NodeBase {
  kind: "null_literal";
}

/** Grammar node `number`. */
export interface NumberNode extends NodeBase {
  kind: "number";
}

/** Grammar node `self_type`. */
export interface SelfTypeNode extends NodeBase {
  kind: "self_type";
}

/** Grammar node `string_fragment_double`. */
export interface StringFragmentDoubleNode extends NodeBase {
  kind: "string_fragment_double";
}

/** Grammar node `string_fragment_single`. */
export interface StringFragmentSingleNode extends NodeBase {
  kind: "string_fragment_single";
}

/** Grammar node `template_chars`. */
export interface TemplateCharsNode extends NodeBase {
  kind: "template_chars";
}

/** Grammar node `type_identifier`. */
export interface TypeIdentifierNode extends NodeBase {
  kind: "type_identifier";
}

/** Grammar node `undefined_literal`. */
export interface UndefinedLiteralNode extends NodeBase {
  kind: "undefined_literal";
}

/** Grammar node `wildcard_pattern`. */
export interface WildcardPatternNode extends NodeBase {
  kind: "wildcard_pattern";
}

/** Discriminated union over every named node in the grammar. */
export type AstNode =
  | ArgumentsNode
  | ArrayLiteralNode
  | ArrayTypeNode
  | ArrowFunctionNode
  | ArrowParametersNode
  | AssignmentExpressionNode
  | AttributeNode
  | AttributeArgumentsNode
  | AttributeCallNode
  | AttributeItemNode
  | AttributedDeclarationNode
  | BinaryExpressionNode
  | BindingPatternNode
  | BlockExpressionNode
  | BooleanNode
  | CallExpressionNode
  | ExportStatementNode
  | FormalParameterNode
  | FunctionDeclarationNode
  | FunctionTypeNode
  | GenericTypeNode
  | IfStatementNode
  | ImplBodyNode
  | ImplDeclarationNode
  | ImplMethodNode
  | ImportClauseNode
  | ImportSpecifierNode
  | ImportStatementNode
  | LiteralPatternNode
  | MatchArmNode
  | MatchExpressionNode
  | MemberExpressionNode
  | NamedImportsNode
  | NamedTypeNode
  | NamespaceImportNode
  | ObjectLiteralNode
  | ObjectPatternNode
  | ObjectPropertyNode
  | ObjectTypeNode
  | ParenthesisedExpressionNode
  | PatternBindNode
  | PatternBodyNode
  | PatternCheckNode
  | PatternShorthandNode
  | PrimitiveTypeNode
  | PropertySignatureNode
  | RangeExpressionNode
  | ReturnStatementNode
  | ShorthandPropertyNode
  | SourceFileNode
  | SpreadElementNode
  | StatementBlockNode
  | StringNode
  | StructBodyNode
  | StructDeclarationNode
  | StructFieldNode
  | StructPatternNode
  | SubscriptExpressionNode
  | TemplateStringNode
  | TemplateSubstitutionNode
  | TernaryExpressionNode
  | TraitBodyNode
  | TraitDeclarationNode
  | TraitMethodNode
  | TryExpressionNode
  | TupleStructDeclarationNode
  | TupleTypeNode
  | TypeAliasNode
  | TypeArgumentsNode
  | TypeParameterNode
  | TypeParameterDeclNode
  | TypeParametersNode
  | UnaryExpressionNode
  | UnionTypeNode
  | VariableDeclarationNode
  | BlockCommentNode
  | EscapeSequenceNode
  | IdentifierNode
  | LineCommentNode
  | NullLiteralNode
  | NumberNode
  | SelfTypeNode
  | StringFragmentDoubleNode
  | StringFragmentSingleNode
  | TemplateCharsNode
  | TypeIdentifierNode
  | UndefinedLiteralNode
  | WildcardPatternNode
;
