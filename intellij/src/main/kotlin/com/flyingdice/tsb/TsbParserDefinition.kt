package com.flyingdice.tsb

import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

/**
 * Minimum-viable parser. We don't build a typed PSI tree — every
 * token becomes a leaf inside a single file root. All semantic
 * features (resolution, completion, diagnostics, code actions) come
 * from the LSP, so the PSI exists only to keep the platform happy.
 */
class TsbParserDefinition : ParserDefinition {
  override fun createLexer(project: Project?): Lexer = TsbLexer()
  override fun getFileNodeType(): IFileElementType = TsbTokenTypes.FILE
  override fun getCommentTokens(): TokenSet = TokenSet.create(
    TsbTokenTypes.LINE_COMMENT,
    TsbTokenTypes.DOC_LINE_COMMENT,
    TsbTokenTypes.BLOCK_COMMENT,
    TsbTokenTypes.DOC_BLOCK_COMMENT,
  )
  override fun getStringLiteralElements(): TokenSet = TokenSet.create(
    TsbTokenTypes.STRING,
    TsbTokenTypes.TEMPLATE_STRING,
  )
  override fun createParser(project: Project?): PsiParser = TsbPsiParser
  override fun createElement(node: ASTNode): PsiElement = LeafPsiElement(node.elementType, node.text)
  override fun createFile(viewProvider: FileViewProvider): PsiFile = TsbFile(viewProvider)
}
