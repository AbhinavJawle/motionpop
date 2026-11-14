#!/usr/bin/env bash
# Runs a hook script with Node even when Kiro's hook shell has no nvm on PATH.
# Usage: bash .kiro/hooks/scripts/node.sh <script.mjs> [args...]
if ! command -v node >/dev/null 2>&1; then
  latest="$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$latest" ] && export PATH="$latest:$PATH"
fi
exec node "$(dirname "$0")/$1" "${@:2}"
