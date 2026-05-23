package com.flyingdice.tsb

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.tree.IElementType

private val KEY_KEYWORD = TextAttributesKey.createTextAttributesKey("TSB_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE_KEYWORD = TextAttributesKey.createTextAttributesKey("TSB_TYPE_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
private val KEY_TYPE = TextAttributesKey.createTextAttributesKey("TSB_TYPE", DefaultLanguageHighlighterColors.CLASS_NAME)
private val KEY_NUMBER = TextAttributesKey.createTextAttributesKey("TSB_NUMBER", DefaultLanguageHighlighterColors.NUMBER)
private val KEY_STRING = TextAttributesKey.createTextAttributesKey("TSB_STRING", DefaultLanguageHighlighterColors.STRING)
private val KEY_LINE_COMMENT = TextAttributesKey.createTextAttributesKey("TSB_LINE_COMMENT", DefaultLanguageHighlighterColors.LINE_COMMENT)
private val KEY_DOC_COMMENT = TextAttributesKey.createTextAttributesKey("TSB_DOC_COMMENT", DefaultLanguageHighlighterColors.DOC_COMMENT)
private val KEY_BLOCK_COMMENT = TextAttributesKey.createTextAttributesKey("TSB_BLOCK_COMMENT", DefaultLanguageHighlighterColors.BLOCK_COMMENT)
private val KEY_ATTRIBUTE = TextAttributesKey.createTextAttributesKey("TSB_ATTRIBUTE", DefaultLanguageHighlighterColors.METADATA)
private val KEY_PUNCT = TextAttributesKey.createTextAttributesKey("TSB_PUNCT", DefaultLanguageHighlighterColors.BRACES)
private val KEY_OPERATOR = TextAttributesKey.createTextAttributesKey("TSB_OPERATOR", DefaultLanguageHighlighterColors.OPERATION_SIGN)
private val KEY_BAD = TextAttributesKey.createTextAttributesKey("TSB_BAD_CHAR", DefaultLanguageHighlighterColors.INVALID_STRING_ESCAPE)

class TsbSyntaxHighlighter : SyntaxHighlighterBase() {
  override fun getHighlightingLexer() = TsbLexer()

  override fun getTokenHighlights(tokenType: IElementType): Array<TextAttributesKey> = when (tokenType) {
    TsbTokenTypes.KEYWORD -> arrayOf(KEY_KEYWORD)
    TsbTokenTypes.TYPE_KEYWORD -> arrayOf(KEY_TYPE_KEYWORD)
    TsbTokenTypes.TYPE_IDENTIFIER -> arrayOf(KEY_TYPE)
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
