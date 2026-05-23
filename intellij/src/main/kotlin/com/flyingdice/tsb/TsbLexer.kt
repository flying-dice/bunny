package com.flyingdice.tsb

import com.intellij.lexer.LexerBase
import com.intellij.psi.tree.IElementType

/**
 * Hand-rolled lexer. Scans tokens linearly, recognising the bits we
 * need to colour the file: keywords, type keywords, numbers, strings,
 * template strings, doc comments (rust-style triple-slash and block),
 * attribute starts, identifiers, punctuation, operators.
 *
 * Identifiers carry a tiny bit of context — preceded by `.` → property,
 * followed by `(` → function call — so the highlighter can give
 * methods, calls, and field accesses distinct colours.
 *
 * Everything semantic (resolution, completion, diagnostics) flows
 * through the LSP; the lexer's only job is fast colouring.
 */
class TsbLexer : LexerBase() {
  private var buffer: CharSequence = ""
  private var bufferEnd = 0
  private var startOffset = 0
  private var endOffset = 0
  private var tokenType: IElementType? = null
  // Last char of the most recently emitted non-trivia token. Used by
  // the identifier branch to detect property-access position.
  private var lastNonTriviaChar: Char = ' '

  override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
    this.buffer = buffer
    this.bufferEnd = endOffset
    this.startOffset = startOffset
    this.endOffset = startOffset
    this.lastNonTriviaChar = ' '
    advance()
  }

  override fun getState(): Int = 0
  override fun getTokenType(): IElementType? = tokenType
  override fun getTokenStart(): Int = startOffset
  override fun getTokenEnd(): Int = endOffset
  override fun getBufferSequence(): CharSequence = buffer
  override fun getBufferEnd(): Int = bufferEnd

  override fun advance() {
    val prev = tokenType
    if (prev != null && !isTrivia(prev) && endOffset > 0 && endOffset <= bufferEnd) {
      lastNonTriviaChar = buffer[endOffset - 1]
    }
    startOffset = endOffset
    if (startOffset >= bufferEnd) {
      tokenType = null
      return
    }
    val c = buffer[startOffset]

    if (c.isWhitespace()) {
      endOffset = startOffset + 1
      while (endOffset < bufferEnd && buffer[endOffset].isWhitespace()) endOffset++
      tokenType = TsbTokenTypes.WHITESPACE
      return
    }

    if (c == '/') {
      val next = peek(1)
      if (next == '/') {
        val docStyle = peek(2) == '/'
        endOffset = startOffset + 2
        while (endOffset < bufferEnd && buffer[endOffset] != '\n') endOffset++
        tokenType = if (docStyle) TsbTokenTypes.DOC_LINE_COMMENT else TsbTokenTypes.LINE_COMMENT
        return
      }
      if (next == '*') {
        val docStyle = peek(2) == '*' && peek(3) != '/'
        endOffset = startOffset + 2
        while (endOffset + 1 < bufferEnd && !(buffer[endOffset] == '*' && buffer[endOffset + 1] == '/')) endOffset++
        endOffset = (endOffset + 2).coerceAtMost(bufferEnd)
        tokenType = if (docStyle) TsbTokenTypes.DOC_BLOCK_COMMENT else TsbTokenTypes.BLOCK_COMMENT
        return
      }
    }

    if (c == '#' && peek(1) == '[') {
      // Consume the entire `#[ … ]` block as a single attribute token
      // so the macro's contents stay one consistent colour instead of
      // re-colouring derive names / arguments as functions and types.
      // Bracket-counting so nested `[`/`]` inside attribute arguments
      // (rare but legal) still finds the right closer.
      endOffset = startOffset + 2
      var depth = 1
      while (endOffset < bufferEnd && depth > 0) {
        val ch = buffer[endOffset]
        if (ch == '[') depth++
        else if (ch == ']') depth--
        else if (ch == '\n' && depth == 1) {
          // Unterminated `#[…` — bail at end of line so we don't eat
          // the rest of the file.
          break
        }
        endOffset++
      }
      tokenType = TsbTokenTypes.ATTRIBUTE
      return
    }

    if (c == '"' || c == '\'') {
      endOffset = scanQuoted(c)
      tokenType = TsbTokenTypes.STRING
      return
    }
    if (c == '`') {
      endOffset = scanQuoted('`')
      tokenType = TsbTokenTypes.TEMPLATE_STRING
      return
    }

    if (c.isDigit()) {
      endOffset = startOffset + 1
      while (endOffset < bufferEnd && (buffer[endOffset].isDigit() || buffer[endOffset] == '.' || buffer[endOffset] == '_')) endOffset++
      tokenType = TsbTokenTypes.NUMBER
      return
    }

    if (c.isLetter() || c == '_' || c == '$') {
      endOffset = startOffset + 1
      while (endOffset < bufferEnd) {
        val ch = buffer[endOffset]
        if (ch.isLetterOrDigit() || ch == '_' || ch == '$') endOffset++ else break
      }
      val word = buffer.subSequence(startOffset, endOffset).toString()
      val followedByParen = nextNonWsChar() == '('
      val precededByDot = lastNonTriviaChar == '.'
      tokenType = when {
        word in KEYWORDS -> TsbTokenTypes.KEYWORD
        word in TYPE_KEYWORDS -> TsbTokenTypes.TYPE_KEYWORD
        word.isNotEmpty() && word[0].isUpperCase() -> TsbTokenTypes.TYPE_IDENTIFIER
        precededByDot && followedByParen -> TsbTokenTypes.METHOD
        precededByDot -> TsbTokenTypes.PROPERTY
        followedByParen -> TsbTokenTypes.FUNCTION
        else -> TsbTokenTypes.IDENTIFIER
      }
      return
    }

    if (c in PUNCT_CHARS) {
      endOffset = startOffset + 1
      tokenType = TsbTokenTypes.PUNCTUATION
      return
    }

    if (c in OPERATOR_CHARS) {
      endOffset = startOffset + 1
      while (endOffset < bufferEnd && buffer[endOffset] in OPERATOR_CHARS) endOffset++
      tokenType = TsbTokenTypes.OPERATOR
      return
    }

    endOffset = startOffset + 1
    tokenType = TsbTokenTypes.BAD_CHARACTER
  }

  private fun peek(off: Int): Char {
    val i = startOffset + off
    if (i < bufferEnd) return buffer[i]
    return ' '
  }

  // Look past the current token's endOffset, skipping whitespace, to
  // detect `identifier(` so we can classify the token as a call.
  private fun nextNonWsChar(): Char {
    var i = endOffset
    while (i < bufferEnd && buffer[i].isWhitespace()) i++
    if (i < bufferEnd) return buffer[i]
    return ' '
  }

  private fun scanQuoted(quote: Char): Int {
    var i = startOffset + 1
    while (i < bufferEnd) {
      val ch = buffer[i]
      if (ch == '\\' && i + 1 < bufferEnd) { i += 2; continue }
      if (ch == quote) return i + 1
      if (ch == '\n' && quote != '`') return i
      i++
    }
    return i
  }

  private fun isTrivia(t: IElementType): Boolean =
    t == TsbTokenTypes.WHITESPACE
      || t == TsbTokenTypes.LINE_COMMENT
      || t == TsbTokenTypes.DOC_LINE_COMMENT
      || t == TsbTokenTypes.BLOCK_COMMENT
      || t == TsbTokenTypes.DOC_BLOCK_COMMENT

  companion object {
    private val KEYWORDS = setOf(
      "import", "from", "export", "as", "type",
      "let", "const", "return", "if", "else",
      "struct", "impl", "trait", "match", "for",
      "function", "async", "await",
      "true", "false", "null", "undefined",
      "self", "Self",
    )
    private val TYPE_KEYWORDS = setOf(
      "string", "number", "boolean", "void", "any", "unknown", "never",
    )
    private val PUNCT_CHARS = setOf('(', ')', '{', '}', '[', ']', ',', ';', '.')
    private val OPERATOR_CHARS = setOf('=', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '&', '|', '^', '~')
  }
}
