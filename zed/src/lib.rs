//! Zed extension for the `neoc` language.
//!
//! Boots `neoc lsp` (or `bun src/cli.ts lsp` when `neoc` isn't on PATH)
//! as the language server for `.neoc` files. The LSP delivers diagnostics,
//! completion, hover, and goto-definition.

use zed_extension_api::{
    self as zed, Command, LanguageServerId, Result, Worktree, register_extension,
};

struct TsbExtension;

impl zed::Extension for TsbExtension {
    fn new() -> Self {
        TsbExtension
    }

    fn language_server_command(
        &mut self,
        _server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        // Prefer the installed `neoc` binary if it's on PATH.
        if let Some(bin) = worktree.which("neoc") {
            return Ok(Command {
                command: bin,
                args: vec!["lsp".into()],
                env: Default::default(),
            });
        }

        // Fall back to invoking the in-repo CLI via Bun. Requires `bun` on
        // PATH and `src/cli.ts` at the worktree root.
        let bun = worktree
            .which("bun")
            .ok_or_else(|| "bun not found in PATH".to_string())?;
        let cli = format!("{}/src/cli.ts", worktree.root_path());
        Ok(Command {
            command: bun,
            args: vec!["run".into(), cli, "lsp".into()],
            env: Default::default(),
        })
    }
}

register_extension!(TsbExtension);
