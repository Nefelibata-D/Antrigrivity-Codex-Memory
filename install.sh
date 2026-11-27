#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 18) is required. Please install Node.js first." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/install.mjs" ]]; then
  exec node "$SCRIPT_DIR/install.mjs" "$@"
fi

REPO="Nefelibata-D/Antrigrivity-Codex-Memory"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[antigrivity-memory] Fetching latest release from GitHub..."
TAR_URL="$(curl -fsSL -H "User-Agent: antigrivity-memory-installer" "https://api.github.com/repos/$REPO/releases/latest" | node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tarball_url || '');")"

if [[ -z "$TAR_URL" ]]; then
  TAR_URL="https://api.github.com/repos/$REPO/tarball/main"
fi

mkdir -p "$TMP_DIR/src"
curl -fsSL -L -H "User-Agent: antigrivity-memory-installer" "$TAR_URL" | tar -xz -C "$TMP_DIR/src" --strip-components=1
node "$TMP_DIR/src/install.mjs" "$@"
