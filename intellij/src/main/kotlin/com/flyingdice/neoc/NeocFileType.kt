package com.flyingdice.neoc

import com.intellij.openapi.fileTypes.LanguageFileType
import javax.swing.Icon

object NeocFileType : LanguageFileType(NeocLanguage) {
  override fun getName(): String = "neoc"
  override fun getDescription(): String = "neoc source file"
  override fun getDefaultExtension(): String = "neoc"
  override fun getIcon(): Icon = NeocIcons.FILE
}
