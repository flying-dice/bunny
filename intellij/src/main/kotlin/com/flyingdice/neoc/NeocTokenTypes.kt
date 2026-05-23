package com.flyingdice.neoc

import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType

class NeocTokenType(debugName: String) : IElementType(debugName, NeocLanguage)

object NeocTokenTypes {
  val FILE = IFileElementType(NeocLanguage)

  val WHITESPACE = NeocTokenType("WHITESPACE")
  val LINE_COMMENT = NeocTokenType("LINE_COMMENT")
  val DOC_LINE_COMMENT = NeocTokenType("DOC_LINE_COMMENT")
  val BLOCK_COMMENT = NeocTokenType("BLOCK_COMMENT")
  val DOC_BLOCK_COMMENT = NeocTokenType("DOC_BLOCK_COMMENT")

  val KEYWORD = NeocTokenType("KEYWORD")
  val TYPE_KEYWORD = NeocTokenType("TYPE_KEYWORD")
  val STRING = NeocTokenType("STRING")
  val TEMPLATE_STRING = NeocTokenType("TEMPLATE_STRING")
  val NUMBER = NeocTokenType("NUMBER")
  val IDENTIFIER = NeocTokenType("IDENTIFIER")
  val TYPE_IDENTIFIER = NeocTokenType("TYPE_IDENTIFIER")
  /** Identifier directly followed by `(` — function or method declaration / call. */
  val FUNCTION = NeocTokenType("FUNCTION")
  /** Identifier preceded by `.` and followed by `(` — method call on a receiver. */
  val METHOD = NeocTokenType("METHOD")
  /** Identifier preceded by `.` (no call) — field / property access. */
  val PROPERTY = NeocTokenType("PROPERTY")
  val ATTRIBUTE = NeocTokenType("ATTRIBUTE")
  val PUNCTUATION = NeocTokenType("PUNCTUATION")
  val OPERATOR = NeocTokenType("OPERATOR")
  val BAD_CHARACTER = NeocTokenType("BAD_CHARACTER")
}
