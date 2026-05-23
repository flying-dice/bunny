package com.flyingdice.neoc

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.openapi.fileTypes.FileType
import com.intellij.psi.FileViewProvider

class NeocFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, NeocLanguage) {
  override fun getFileType(): FileType = NeocFileType
  override fun toString(): String = "neoc file"
}
