package com.flyingdice.tsb

import com.intellij.openapi.fileTypes.LanguageFileType
import javax.swing.Icon

object TsbFileType : LanguageFileType(TsbLanguage) {
  override fun getName(): String = "tsb"
  override fun getDescription(): String = "tsb source file"
  override fun getDefaultExtension(): String = "tsb"
  override fun getIcon(): Icon = TsbIcons.FILE
}
