package com.flyingdice.neoc

import com.intellij.lang.Language

object NeocLanguage : Language("neoc") {
  override fun getDisplayName(): String = "neoc"
  override fun isCaseSensitive(): Boolean = true
}
