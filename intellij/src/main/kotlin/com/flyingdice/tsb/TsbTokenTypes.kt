package com.flyingdice.tsb

import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType

class TsbTokenType(debugName: String) : IElementType(debugName, TsbLanguage)

object TsbTokenTypes {
  val FILE = IFileElementType(TsbLanguage)

  val WHITESPACE = TsbTokenType("WHITESPACE")
  val LINE_COMMENT = TsbTokenType("LINE_COMMENT")
  val DOC_LINE_COMMENT = TsbTokenType("DOC_LINE_COMMENT")
  val BLOCK_COMMENT = TsbTokenType("BLOCK_COMMENT")
  val DOC_BLOCK_COMMENT = TsbTokenType("DOC_BLOCK_COMMENT")

  val KEYWORD = TsbTokenType("KEYWORD")
  val TYPE_KEYWORD = TsbTokenType("TYPE_KEYWORD")
  val STRING = TsbTokenType("STRING")
  val TEMPLATE_STRING = TsbTokenType("TEMPLATE_STRING")
  val NUMBER = TsbTokenType("NUMBER")
  val IDENTIFIER = TsbTokenType("IDENTIFIER")
  val TYPE_IDENTIFIER = TsbTokenType("TYPE_IDENTIFIER")
  /** Identifier directly followed by `(` — function or method declaration / call. */
  val FUNCTION = TsbTokenType("FUNCTION")
  /** Identifier preceded by `.` and followed by `(` — method call on a receiver. */
  val METHOD = TsbTokenType("METHOD")
  /** Identifier preceded by `.` (no call) — field / property access. */
  val PROPERTY = TsbTokenType("PROPERTY")
  val ATTRIBUTE = TsbTokenType("ATTRIBUTE")
  val PUNCTUATION = TsbTokenType("PUNCTUATION")
  val OPERATOR = TsbTokenType("OPERATOR")
  val BAD_CHARACTER = TsbTokenType("BAD_CHARACTER")
}
