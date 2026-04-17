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

# تشغيل الواجهة فقط وبأقل إعدادات (بدون قواعد محلية):
# نشغّل Next.js مباشرة باستخدام API العام. هذا يتجنب build طويل جداً (static export) وقد يعلق بسبب generateStaticParams الضخم.
# ملاحظة: هذا "dev server" لكنه أخف بكثير من تشغيل المونوربو (turbo+wrangler+postgres).

PORT="${PORT:-8082}"
HOST="${HOST:-0.0.0.0}"

if command -v pnpm >/dev/null 2>&1; then
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.qafiyah.com}"
  exec pnpm --dir apps/web exec next dev -p "$PORT" -H "$HOST"
fi

WEB_NEXT="$WEB_DIR/node_modules/.bin/next"
if [ -x "$WEB_NEXT" ]; then
  cd "$WEB_DIR"
  exec ./node_modules/.bin/next dev -p 8082 -H 0.0.0.0
fi

ROOT_NEXT="$QAF_DIR/node_modules/.bin/next"
if [ -x "$ROOT_NEXT" ]; then
  exec "$ROOT_NEXT" dev ./apps/web -p 8082 -H 0.0.0.0
fi

echo "qafiyah-systemd-start: لم يُعثر على next (pnpm أو apps/web/node_modules). من $QAF_DIR نفّذ: pnpm install" >&2
exit 1
