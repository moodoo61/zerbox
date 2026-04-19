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
# pnpm (تثبيت مستقل أو npm prefix)
for _p in "$HOME/.local/share/pnpm" "/usr/local/share/npm-global/bin"; do
  [ -d "$_p" ] && PATH="$_p:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  for d in "$HOME/.nvm/versions/node"/*/bin; do
    [ -d "$d" ] && PATH="$d:$PATH"
  done
fi

WEB_DIR="$QAF_DIR/apps/web"
if [ ! -f "$WEB_DIR/package.json" ]; then
  echo "qafiyah-systemd-start: مفقود $WEB_DIR/package.json — المشروع ليس monorepo كاملاً أو المسار خاطئ." >&2
  exit 1
fi

# تشغيل منخفض الموارد (بدون قواعد محلية):
# Production server عبر next start + API العام.
# هذا أقل استهلاكاً بشكل واضح من next dev.

PORT="${PORT:-8082}"
HOST="${HOST:-0.0.0.0}"
export NODE_ENV=production
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.qafiyah.com}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "qafiyah-systemd-start: لم يُعثر على pnpm. من $QAF_DIR نفّذ: pnpm install" >&2
  exit 1
fi

# نحتاج build إنتاجي مسبق قبل next start.
if [ ! -f "$WEB_DIR/.next/BUILD_ID" ]; then
  echo "qafiyah-systemd-start: لا يوجد build إنتاجي جاهز. نفّذ مرة واحدة:" >&2
  echo "  cd $QAF_DIR && pnpm --dir apps/web run build:server:public-api" >&2
  exit 1
fi

exec pnpm --dir apps/web exec next start -p "$PORT" -H "$HOST"
