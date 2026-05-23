package com.flyingdice.tsb

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor

/**
 * Spawns `bunny lsp` over stdio. Assumes `bunny` resolves on the user's
 * PATH — the README has install instructions.
 *
 * Override the command via the `TSB_LSP_COMMAND` environment variable
 * (whitespace-split, e.g. `bun /path/to/cli.ts lsp`) for development
 * builds where you'd rather run the LSP straight out of the repo.
 */
class TsbLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "tsb") {

  override fun isSupportedFile(file: VirtualFile): Boolean = file.extension == "tsb"

  override fun createCommandLine(): GeneralCommandLine {
    val override = System.getenv("TSB_LSP_COMMAND")?.trim().orEmpty()
    val argv: List<String> = if (override.isNotEmpty()) {
      override.split(Regex("\\s+"))
    } else {
      listOf("bunny", "lsp")
    }
    return GeneralCommandLine(argv).withCharset(Charsets.UTF_8).also {
      val cwd = project.basePath
      if (cwd != null) it.withWorkDirectory(cwd)
    }
  }
}
