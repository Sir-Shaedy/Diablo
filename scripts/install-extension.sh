#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v npm >/dev/null 2>&1 || { echo "Missing npm" >&2; exit 1; }
command -v code >/dev/null 2>&1 || { echo "Missing code" >&2; exit 1; }

if ! ls extension/*.vsix >/dev/null 2>&1; then
  npm --prefix extension run package >/dev/null
fi

VSIX_PATH="$(ls -t extension/*.vsix | head -n1)"
code --install-extension "$VSIX_PATH" --force

echo "Installed $VSIX_PATH"
