plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "1.9.25"
  id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.flyingdice.tsb"
version = providers.gradleProperty("pluginVersion").get()

repositories { mavenCentral() }

intellij {
  version.set(providers.gradleProperty("platformVersion"))
  // WebStorm is required for the LSP API; the artifact name is `WS`.
  type.set("WS")
  // No third-party plugin dependencies — LSP API ships with the platform.
  plugins.set(listOf<String>())
}

kotlin {
  jvmToolchain(17)
}

tasks {
  patchPluginXml {
    sinceBuild.set(providers.gradleProperty("pluginSinceBuild"))
    untilBuild.set(providers.gradleProperty("pluginUntilBuild"))
  }
  // Disable the searchable-options index step — it spins up a fresh
  // IDE instance and isn't useful for a single-language plugin.
  buildSearchableOptions { enabled = false }
}
