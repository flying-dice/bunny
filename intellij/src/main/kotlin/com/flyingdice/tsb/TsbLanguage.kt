package com.flyingdice.tsb

import com.intellij.lang.Language

object TsbLanguage : Language("tsb") {
  override fun getDisplayName(): String = "tsb"
  override fun isCaseSensitive(): Boolean = true
}
