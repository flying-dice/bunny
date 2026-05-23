package com.flyingdice.tsb

import com.intellij.lang.ASTNode
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.psi.tree.IElementType

/**
 * Trivial parser: flatten every token under the file root. The PSI
 * isn't used for navigation; that's the LSP's job.
 */
object TsbPsiParser : PsiParser {
  override fun parse(root: IElementType, builder: PsiBuilder): ASTNode {
    val mark = builder.mark()
    while (!builder.eof()) builder.advanceLexer()
    mark.done(root)
    return builder.treeBuilt
  }
}
