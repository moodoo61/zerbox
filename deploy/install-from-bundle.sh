#!/bin/bash
# تثبيت الاعتماديات وبناء المشروع بعد استخراج حزمة النشر على جهاز جديد
# يشمل: Backend، Frontend الرئيسي، قرآن، قافية
# الاستخدام: من جذر المشروع (المستخرج): ./deploy/install-from-bundle.sh

set -e
ZERO_ROOT="${ZERO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ZERO_ROOT"

echo "=========================================="
echo "  تثبيت Zero والمشاريع المرتبطة"
echo "  المسار: $ZERO_ROOT"
echo "=========================================="

# 1) Backend
echo "[1/5] تثبيت اعتماديات Backend (Python)..."
pip3 install -r backend/requirements.txt 2>/dev/null || pip3 install --user -r backend/requirements.txt

# 2) Frontend الرئيسي
echo "[2/5] تثبيت اعتماديات الواجهة الأمامية..."
cd "$ZERO_ROOT/frontend"
npm install
echo "      بناء الواجهة الأمامية..."
npm run build
cd "$ZERO_ROOT"

# 3) قرآن (إن وُجد)
if [ -f "$ZERO_ROOT/frontend/quran/package.json" ]; then
  echo "[3/5] تثبيت اعتماديات تطبيق القرآن..."
  (cd "$ZERO_ROOT/frontend/quran" && npm install)
else
  echo "[3/5] تطبيق القرآن غير موجود — تخطي."
fi

# 4) قافية (إن وُجد)
if [ -f "$ZERO_ROOT/qafiyah/package.json" ] || [ -f "$ZERO_ROOT/qafiyah/apps/web/package.json" ]; then
  echo "[4/5] تثبيت اعتماديات قافية..."
  if [ -f "$ZERO_ROOT/qafiyah/package.json" ]; then
    (cd "$ZERO_ROOT/qafiyah" && npm install 2>/dev/null || true)
  fi
  if [ -f "$ZERO_ROOT/qafiyah/apps/web/package.json" ]; then
    (cd "$ZERO_ROOT/qafiyah/apps/web" && npm install 2>/dev/null || true)
  fi
else
  echo "[4/5] مشروع قافية غير موجود — تخطي."
fi

# 5) تذكير بالبيانات والخدمات
echo "[5/5] التحقق من الملفات الضرورية..."
MISSING=""
[ ! -f "$ZERO_ROOT/database.db" ] && MISSING="$MISSING database.db (سيُنشأ تلقائياً عند أول تشغيل)"
[ ! -f "$ZERO_ROOT/key.json" ] && [ ! -f "$ZERO_ROOT/kay.json" ] && MISSING="$MISSING key.json أو kay.json (لتفعيل البث)"
[ -n "$MISSING" ] && echo "      تحذير: قد تحتاج: $MISSING"

echo ""
echo "=========================================="
echo "  انتهى التثبيت."
echo "  للتشغيل (إنتاج): $ZERO_ROOT/start-production.sh"
echo "  للتشغيل (تطوير): $ZERO_ROOT/start.sh"
echo "  راجع DEPLOY_MANIFEST.md لتفعيل Jellyfin و MistServer و zero-network-helper."
echo "=========================================="
