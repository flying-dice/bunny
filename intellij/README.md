# neoc — WebStorm plugin

Syntax highlighting, completion, hover, diagnostics, and quick-fixes for `.neoc` files in WebStorm.

## How it works

- **Highlighting** — native Kotlin lexer + `SyntaxHighlighter` (no LSP dependency for colour). Tokenises keywords, type keywords, doc comments, attributes, strings, numbers.
- **Semantic features** — bridged to the neoc LSP server. The plugin spawns `neoc lsp` over stdio when the first `.neoc` file in a project opens.

## Requirements

- WebStorm 2023.2+ (the IntelliJ Platform LSP API ships from 232).
- `neoc` on PATH.

Install neoc globally so `neoc lsp` resolves:

```
cd /path/to/neoc
bun install
bun link
```

## Build & sideload

The repo doesn't ship the Gradle wrapper jar. Install Gradle 8.5+ once (`brew install gradle` or equivalent), then bootstrap the wrapper:

```
cd intellij
gradle wrapper --gradle-version 8.10
./gradlew buildPlugin
```

The plugin zip lands in `build/distributions/neoc-intellij-<version>.zip`. In WebStorm, `Settings → Plugins → ⚙ → Install Plugin from Disk…` and pick that file.

To iterate against a sandboxed IDE without packaging:

```
./gradlew runIde
```

`runIde` launches a sandboxed **IntelliJ IDEA Ultimate** by default (that's the platform we build against). The packaged plugin still installs into WebStorm — IDEA Ultimate, WebStorm, PhpStorm, and GoLand share the same LSP API and platform module. To sandbox-launch WebStorm specifically, pass `-PrunIdeFromInstallation=/Applications/WebStorm.app` if you have it installed.

## Dev mode — point the LSP at a checkout

Set `NEOC_LSP_COMMAND` before launching WebStorm to use a repo-local LSP instead of the globally-linked one:

```
export NEOC_LSP_COMMAND="bun /Users/me/Projects/neoc/src/cli.ts lsp"
```

The plugin splits the value on whitespace and runs it from the project's base directory.

## What's not (yet) here

- A native parser / PSI tree. We rely entirely on the LSP for resolution, refactors, structure view, find-usages.
- Settings UI for the LSP command — `NEOC_LSP_COMMAND` is the escape hatch for now.
