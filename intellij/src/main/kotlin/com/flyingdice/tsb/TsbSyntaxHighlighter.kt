package com.flyingdice.tsb

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.tree.IElementType

private val KEY_KEYWORD = key("TSB_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE_KEYWORD = key("TSB_TYPE_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE = key("TSB_TYPE", DefaultLanguageHighlighterColors.CLASS_NAME)
private val KEY_NUMBER = key("TSB_NUMBER", DefaultLanguageHighlighterColors.NUMBER)
private val KEY_STRING = key("TSB_STRING", DefaultLanguageHighlighterColors.STRING)
private val KEY_LINE_COMMENT = key("TSB_LINE_COMMENT", DefaultLanguageHighlighterColors.LINE_COMMENT)
private val KEY_DOC_COMMENT = key("TSB_DOC_COMMENT", DefaultLanguageHighlighterColors.DOC_COMMENT)
private val KEY_BLOCK_COMMENT = key("TSB_BLOCK_COMMENT", DefaultLanguageHighlighterColors.BLOCK_COMMENT)
private val KEY_ATTRIBUTE = key("TSB_ATTRIBUTE", DefaultLanguageHighlighterColors.METADATA)
private val KEY_PUNCT = key("TSB_PUNCT", DefaultLanguageHighlighterColors.BRACES)
private val KEY_OPERATOR = key("TSB_OPERATOR", DefaultLanguageHighlighterColors.OPERATION_SIGN)
private val KEY_BAD = key("TSB_BAD_CHAR", DefaultLanguageHighlighterColors.INVALID_STRING_ESCAPE)

private val KEY_FUNCTION = key("TSB_FUNCTION", DefaultLanguageHighlighterColors.FUNCTION_DECLARATION)
private val KEY_METHOD = key("TSB_METHOD", DefaultLanguageHighlighterColors.INSTANCE_METHOD)
private val KEY_PROPERTY = key("TSB_PROPERTY", DefaultLanguageHighlighterColors.INSTANCE_FIELD)
private val KEY_IDENTIFIER = key("TSB_IDENTIFIER", DefaultLanguageHighlighterColors.IDENTIFIER)

private fun key(name: String, fallback: TextAttributesKey): TextAttributesKey =
  TextAttributesKey.createTextAttributesKey(name, fallback)

class TsbSyntaxHighlighter : SyntaxHighlighterBase() {
  override fun getHighlightingLexer() = TsbLexer()

  override fun getTokenHighlights(tokenType: IElementType): Array<TextAttributesKey> = when (tokenType) {
    TsbTokenTypes.KEYWORD -> arrayOf(KEY_KEYWORD)
    TsbTokenTypes.TYPE_KEYWORD -> arrayOf(KEY_TYPE_KEYWORD)
    TsbTokenTypes.TYPE_IDENTIFIER -> arrayOf(KEY_TYPE)
    TsbTokenTypes.FUNCTION -> arrayOf(KEY_FUNCTION)
    TsbTokenTypes.METHOD -> arrayOf(KEY_METHOD)
    TsbTokenTypes.PROPERTY -> arrayOf(KEY_PROPERTY)
    TsbTokenTypes.IDENTIFIER -> arrayOf(KEY_IDENTIFIER)
    TsbTokenTypes.NUMBER -> arrayOf(KEY_NUMBER)
    TsbTokenTypes.STRING, TsbTokenTypes.TEMPLATE_STRING -> arrayOf(KEY_STRING)
    TsbTokenTypes.LINE_COMMENT -> arrayOf(KEY_LINE_COMMENT)
    TsbTokenTypes.DOC_LINE_COMMENT, TsbTokenTypes.DOC_BLOCK_COMMENT -> arrayOf(KEY_DOC_COMMENT)
    TsbTokenTypes.BLOCK_COMMENT -> arrayOf(KEY_BLOCK_COMMENT)
    TsbTokenTypes.ATTRIBUTE -> arrayOf(KEY_ATTRIBUTE)
    TsbTokenTypes.PUNCTUATION -> arrayOf(KEY_PUNCT)
    TsbTokenTypes.OPERATOR -> arrayOf(KEY_OPERATOR)
    TsbTokenTypes.BAD_CHARACTER -> arrayOf(KEY_BAD)
    else -> emptyArray()
  }
}

class TsbSyntaxHighlighterFactory : SyntaxHighlighterFactory() {
  override fun getSyntaxHighlighter(project: Project?, virtualFile: VirtualFile?): SyntaxHighlighter = TsbSyntaxHighlighter()
}
