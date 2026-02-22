#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd python3
require_cmd npm
require_cmd code

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

python3 -m pip install --upgrade pip setuptools wheel >/dev/null
python3 -m pip install -e . >/dev/null

npm --prefix extension install >/dev/null
npm --prefix extension run package >/dev/null

VSIX_PATH="$(ls -t extension/*.vsix | head -n1)"
if [[ -z "${VSIX_PATH:-}" ]]; then
  echo "No VSIX produced." >&2
  exit 1
fi

code --install-extension "$VSIX_PATH" --force

echo
echo "Diablo installed from: $VSIX_PATH"
echo "Next: start backend with 'python3 -m backend.server' from repo root."
