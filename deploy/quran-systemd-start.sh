#!/usr/bin/env bash
# تشغيل خادم القرآن عبر node من PATH (يشمل nvm إن وُجد تحت HOME).
set -euo pipefail

THIS_SCRIPT="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && readlink -f / >/dev/null 2>&1; then
  THIS_SCRIPT="$(readlink -f "$THIS_SCRIPT")"
fi
SCRIPT_DIR="$(cd "$(dirname "$THIS_SCRIPT")" && pwd)"
DERIVED_ZERO="$(cd "$SCRIPT_DIR/.." && pwd)"

ZERO_ROOT="${ZERO_ROOT:-$DERIVED_ZERO}"
ZERO_ROOT="$(cd "$ZERO_ROOT" && pwd)"

QURAN_DIR="$ZERO_ROOT/quran"
if [ ! -d "$QURAN_DIR" ] || [ ! -f "$QURAN_DIR/server/server.mjs" ]; then
  echo "quran-systemd-start: مفقود $QURAN_DIR/server/server.mjs" >&2
  exit 1
fi

cd "$QURAN_DIR"

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
if [ -d "${HOME:-}/.nvm/versions/node" ]; then
  for d in "${HOME}/.nvm/versions/node"/*/bin; do
    [ -d "$d" ] && PATH="$d:$PATH"
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "quran-systemd-start: لم يُعثر على node في PATH (ثبّت Node أو فعّل nvm)." >&2
  exit 1
fi

exec node server/server.mjs
