package com.flyingdice.tsb

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import java.io.File

/**
 * Spawns `bunny lsp` over stdio.
 *
 * Resolution order:
 *  1. `TSB_LSP_COMMAND` environment variable — whitespace-split argv.
 *     Use this for repo-local dev builds: `bun /path/to/cli.ts lsp`.
 *  2. `bunny` on the inherited PATH (works when WebStorm is launched
 *     from a terminal where `bun link` has been run).
 *  3. Common user-shell install locations searched explicitly —
 *     `~/.bun/bin/bunny`, `/usr/local/bin/bunny`, `/opt/homebrew/bin/bunny`.
 *     This rescues the macOS case where a Finder-launched IDE has a
 *     minimal PATH that doesn't include `~/.bun/bin`.
 */
class TsbLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "tsb") {
  private val log = logger<TsbLspServerDescriptor>()

  override fun isSupportedFile(file: VirtualFile): Boolean = file.extension == "tsb"

  override fun createCommandLine(): GeneralCommandLine {
    val override = System.getenv("TSB_LSP_COMMAND")?.trim().orEmpty()
    val argv: List<String> = if (override.isNotEmpty()) {
      log.info("tsb LSP: using TSB_LSP_COMMAND override → $override")
      override.split(Regex("\\s+"))
    } else {
      val resolved = resolveBunny()
      log.info("tsb LSP: resolved bunny to $resolved")
      listOf(resolved, "lsp")
    }
    return GeneralCommandLine(argv).withCharset(Charsets.UTF_8).also {
      val cwd = project.basePath
      if (cwd != null) it.withWorkDirectory(cwd)
    }
  }

  private fun resolveBunny(): String {
    for (candidate in candidatePaths()) {
      val f = File(candidate)
      if (f.canExecute()) return candidate
    }
    // Fall through to plain "bunny" — let the platform surface the
    // ENOENT and the user can fix their PATH or set TSB_LSP_COMMAND.
    return "bunny"
  }

  private fun candidatePaths(): List<String> {
    val home = System.getProperty("user.home")
    return listOf(
      "$home/.bun/bin/bunny",
      "/opt/homebrew/bin/bunny",
      "/usr/local/bin/bunny",
      "/usr/bin/bunny",
    )
  }
}
