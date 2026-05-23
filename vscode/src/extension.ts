/**
 * VS Code extension entry point. Registers tsb as a language and boots
 * `bunny lsp` as the language server.
 *
 *   The extension itself is tiny — VS Code consumes the TextMate grammar
 *   for highlighting, and delegates to the LSP for diagnostics /
 *   completion / hover.
 */
import * as path from "node:path";
import { workspace, type ExtensionContext } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  const config = workspace.getConfiguration("tsb");
  const bunnyPath = config.get<string>("lsp.path", "bunny");

  const serverOptions: ServerOptions = {
    run: {
      command: bunnyPath,
      args: ["lsp"],
      transport: TransportKind.stdio,
    },
    debug: {
      command: bunnyPath,
      args: ["lsp", "--debug"],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "tsb" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.tsb"),
    },
  };

  client = new LanguageClient(
    "tsb",
    "tsb language server",
    serverOptions,
    clientOptions
  );
  client.start();
  context.subscriptions.push({ dispose: () => client?.stop() });
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
