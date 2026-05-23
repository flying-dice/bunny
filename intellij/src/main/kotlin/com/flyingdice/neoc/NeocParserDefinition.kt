package com.flyingdice.neoc

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
class NeocParserDefinition : ParserDefinition {
  override fun createLexer(project: Project?): Lexer = NeocLexer()
  override fun getFileNodeType(): IFileElementType = NeocTokenTypes.FILE
  override fun getCommentTokens(): TokenSet = TokenSet.create(
    NeocTokenTypes.LINE_COMMENT,
    NeocTokenTypes.DOC_LINE_COMMENT,
    NeocTokenTypes.BLOCK_COMMENT,
    NeocTokenTypes.DOC_BLOCK_COMMENT,
  )
  override fun getStringLiteralElements(): TokenSet = TokenSet.create(
    NeocTokenTypes.STRING,
    NeocTokenTypes.TEMPLATE_STRING,
  )
  override fun createParser(project: Project?): PsiParser = NeocPsiParser
  override fun createElement(node: ASTNode): PsiElement = LeafPsiElement(node.elementType, node.text)
  override fun createFile(viewProvider: FileViewProvider): PsiFile = NeocFile(viewProvider)
}
