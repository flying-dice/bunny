package com.flyingdice.neoc

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.tree.IElementType

private val KEY_KEYWORD = key("NEOC_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE_KEYWORD = key("NEOC_TYPE_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE = key("NEOC_TYPE", DefaultLanguageHighlighterColors.CLASS_NAME)
private val KEY_NUMBER = key("NEOC_NUMBER", DefaultLanguageHighlighterColors.NUMBER)
private val KEY_STRING = key("NEOC_STRING", DefaultLanguageHighlighterColors.STRING)
private val KEY_LINE_COMMENT = key("NEOC_LINE_COMMENT", DefaultLanguageHighlighterColors.LINE_COMMENT)
private val KEY_DOC_COMMENT = key("NEOC_DOC_COMMENT", DefaultLanguageHighlighterColors.DOC_COMMENT)
private val KEY_BLOCK_COMMENT = key("NEOC_BLOCK_COMMENT", DefaultLanguageHighlighterColors.BLOCK_COMMENT)
private val KEY_ATTRIBUTE = key("NEOC_ATTRIBUTE", DefaultLanguageHighlighterColors.METADATA)
private val KEY_PUNCT = key("NEOC_PUNCT", DefaultLanguageHighlighterColors.BRACES)
private val KEY_OPERATOR = key("NEOC_OPERATOR", DefaultLanguageHighlighterColors.OPERATION_SIGN)
private val KEY_BAD = key("NEOC_BAD_CHAR", DefaultLanguageHighlighterColors.INVALID_STRING_ESCAPE)

private val KEY_FUNCTION = key("NEOC_FUNCTION", DefaultLanguageHighlighterColors.FUNCTION_DECLARATION)
private val KEY_METHOD = key("NEOC_METHOD", DefaultLanguageHighlighterColors.INSTANCE_METHOD)
private val KEY_PROPERTY = key("NEOC_PROPERTY", DefaultLanguageHighlighterColors.INSTANCE_FIELD)
private val KEY_IDENTIFIER = key("NEOC_IDENTIFIER", DefaultLanguageHighlighterColors.IDENTIFIER)

private fun key(name: String, fallback: TextAttributesKey): TextAttributesKey =
  TextAttributesKey.createTextAttributesKey(name, fallback)

class NeocSyntaxHighlighter : SyntaxHighlighterBase() {
  override fun getHighlightingLexer() = NeocLexer()

  override fun getTokenHighlights(tokenType: IElementType): Array<TextAttributesKey> = when (tokenType) {
    NeocTokenTypes.KEYWORD -> arrayOf(KEY_KEYWORD)
    NeocTokenTypes.TYPE_KEYWORD -> arrayOf(KEY_TYPE_KEYWORD)
    NeocTokenTypes.TYPE_IDENTIFIER -> arrayOf(KEY_TYPE)
    NeocTokenTypes.FUNCTION -> arrayOf(KEY_FUNCTION)
    NeocTokenTypes.METHOD -> arrayOf(KEY_METHOD)
    NeocTokenTypes.PROPERTY -> arrayOf(KEY_PROPERTY)
    NeocTokenTypes.IDENTIFIER -> arrayOf(KEY_IDENTIFIER)
    NeocTokenTypes.NUMBER -> arrayOf(KEY_NUMBER)
    NeocTokenTypes.STRING, NeocTokenTypes.TEMPLATE_STRING -> arrayOf(KEY_STRING)
    NeocTokenTypes.LINE_COMMENT -> arrayOf(KEY_LINE_COMMENT)
    NeocTokenTypes.DOC_LINE_COMMENT, NeocTokenTypes.DOC_BLOCK_COMMENT -> arrayOf(KEY_DOC_COMMENT)
    NeocTokenTypes.BLOCK_COMMENT -> arrayOf(KEY_BLOCK_COMMENT)
    NeocTokenTypes.ATTRIBUTE -> arrayOf(KEY_ATTRIBUTE)
    NeocTokenTypes.PUNCTUATION -> arrayOf(KEY_PUNCT)
    NeocTokenTypes.OPERATOR -> arrayOf(KEY_OPERATOR)
    NeocTokenTypes.BAD_CHARACTER -> arrayOf(KEY_BAD)
    else -> emptyArray()
  }
}

class NeocSyntaxHighlighterFactory : SyntaxHighlighterFactory() {
  override fun getSyntaxHighlighter(project: Project?, virtualFile: VirtualFile?): SyntaxHighlighter = NeocSyntaxHighlighter()
}
