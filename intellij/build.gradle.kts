plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "1.9.25"
  id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.flyingdice.neoc"
version = providers.gradleProperty("pluginVersion").get()

repositories { mavenCentral() }

intellij {
  version.set(providers.gradleProperty("platformVersion"))
  // Build against IntelliJ IDEA Ultimate — it carries the LSP API and
  // the produced plugin also runs in WebStorm / PhpStorm / GoLand. The
  // Gradle plugin (`gradle-intellij-plugin` 1.x) doesn't accept `WS`
  // as a type, so IU is the canonical target.
  type.set("IU")
  // No third-party plugin dependencies — LSP API ships with the platform.
  plugins.set(listOf<String>())
}

kotlin {
  jvmToolchain(17)
}

tasks {
  patchPluginXml {
    sinceBuild.set(providers.gradleProperty("pluginSinceBuild"))
    // No upper bound — the plugin only exercises stable platform APIs
    // (file type, lexer, LSP), so capping it just locks users out of
    // newer IDE builds without buying us anything.
    untilBuild.set(provider { null })
  }
  // Disable the searchable-options index step — it spins up a fresh
  // IDE instance and isn't useful for a single-language plugin.
  buildSearchableOptions { enabled = false }
}
