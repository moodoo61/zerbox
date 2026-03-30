#!/usr/bin/env bash
# تشغيل واجهة قافية من جذر الـ monorepo (مطلوب لـ pnpm workspace).
# يُشتق جذر المشروع من مسار هذا الملف (deploy/ → أعلى مجلد = Zero)،
# ثم يُطبَّق ZERO_ROOT من systemd إن وُجد.
set -euo pipefail

THIS_SCRIPT="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && readlink -f / >/dev/null 2>&1; then
  THIS_SCRIPT="$(readlink -f "$THIS_SCRIPT")"
fi
SCRIPT_DIR="$(cd "$(dirname "$THIS_SCRIPT")" && pwd)"
DERIVED_ZERO="$(cd "$SCRIPT_DIR/.." && pwd)"

ZERO_ROOT="${ZERO_ROOT:-$DERIVED_ZERO}"
ZERO_ROOT="$(cd "$ZERO_ROOT" && pwd)"

QAF_DIR="$ZERO_ROOT/qafiyah"
if [ ! -d "$QAF_DIR" ] || [ ! -f "$QAF_DIR/package.json" ]; then
  echo "qafiyah-systemd-start: لا يوجد مشروع قافية في: $QAF_DIR" >&2
  echo "  انسخ المستودع داخل جذر Zero، مثال: cd $ZERO_ROOT && git clone https://github.com/alwalxed/qafiyah.git qafiyah" >&2
  exit 1
fi

cd "$QAF_DIR"

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
if [ -d "$HOME/.nvm/versions/node" ]; then
  for d in "$HOME/.nvm/versions/node"/*/bin; do
    [ -d "$d" ] && PATH="$d:$PATH"
  done
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "qafiyah-systemd-start: pnpm غير موجود في PATH." >&2
  exit 1
fi

exec pnpm --filter @qaf/web dev -- -p 8082 -H 0.0.0.0
