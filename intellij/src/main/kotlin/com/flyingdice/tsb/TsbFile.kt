package com.flyingdice.tsb

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.openapi.fileTypes.FileType
import com.intellij.psi.FileViewProvider

class TsbFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, TsbLanguage) {
  override fun getFileType(): FileType = TsbFileType
  override fun toString(): String = "tsb file"
}
