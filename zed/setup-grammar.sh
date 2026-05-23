#!/usr/bin/env bash
# Prepares the tsb tree-sitter grammar for a fresh checkout.
#
# 1. Runs `tree-sitter generate` to produce parser.c / grammar.json /
#    node-types.json from grammar.js. These are gitignored — generated
#    artefacts, not source.
# 2. Initialises an inner git repo at a reproducible commit so the
#    Zed extension's `file://` reference can clone it.
#
# Run once after cloning the bunny repo, and again any time
# grammar.js changes meaningfully.
#
# Usage: ./zed/setup-grammar.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GRAMMAR="$HERE/tree-sitter-tsb"

if ! command -v tree-sitter >/dev/null 2>&1; then
  echo "tree-sitter CLI not found. Install with: npm i -g tree-sitter-cli" >&2
  exit 1
fi

echo "regenerating parser from grammar.js…"
( cd "$GRAMMAR" && tree-sitter generate ) >/dev/null

echo "building WASM for compiler runtime…"
( cd "$GRAMMAR" && tree-sitter build --wasm ) >/dev/null

echo "initialising inner git repo (reproducible commit)…"
cd "$GRAMMAR"
rm -rf .git
git init -q
git add -A
GIT_AUTHOR_NAME=bunny GIT_AUTHOR_EMAIL=local@bunny \
GIT_COMMITTER_NAME=bunny GIT_COMMITTER_EMAIL=local@bunny \
GIT_AUTHOR_DATE="2024-01-01T00:00:00+00:00" \
GIT_COMMITTER_DATE="2024-01-01T00:00:00+00:00" \
git commit -q -m "tsb grammar v0.1.0"

SHA="$(git rev-parse HEAD)"
echo ""
echo "grammar committed at $SHA"
echo ""
echo "if this doesn't match extension.toml's [grammars.tsb].commit,"
echo "update extension.toml and reinstall the dev extension."
