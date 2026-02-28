#!/bin/bash
# إنشاء حزمة نشر لمشروع Zero تشمل الكود والبيانات (بدون node_modules وبدون بناء)
# الاستخدام: من جذر المشروع: ./deploy/make-bundle.sh
# أو: ZERO_ROOT=/path/to/Zero ./deploy/make-bundle.sh

set -e
ZERO_ROOT="${ZERO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ZERO_ROOT"
OUTPUT_DIR="${OUTPUT_DIR:-.}"
STAMP=$(date +%Y%m%d-%H%M)
BUNDLE_NAME="zero-deploy-${STAMP}.tar.gz"

echo "=========================================="
echo "  إنشاء حزمة نشر Zero"
echo "  المسار: $ZERO_ROOT"
echo "  الحزمة: $OUTPUT_DIR/$BUNDLE_NAME"
echo "=========================================="

# قائمة استثناء مطابقة لـ .gitignore (لا تُضمّن ملفات المستودع الحساسة والبناء)
TMP_EXCLUDE="$ZERO_ROOT/.deploy-exclude-list"
cat > "$TMP_EXCLUDE" << 'EXCLUDE'
.git
__pycache__
*.pyc
*.pyo
*$py.class
*.so
.pytest_cache
.coverage
htmlcov
.env
.env.*
*.log
database.db
key.json
kay.json
vapid_keys.json
node_modules
frontend/node_modules
frontend/build
frontend/quran/node_modules
qafiyah/node_modules
.DS_Store
*.tar.gz
.deploy-exclude-list
EXCLUDE

tar --exclude-from="$TMP_EXCLUDE" \
    -czf "$OUTPUT_DIR/$BUNDLE_NAME" \
    -C "$(dirname "$ZERO_ROOT")" \
    "$(basename "$ZERO_ROOT")"

rm -f "$TMP_EXCLUDE"

echo ""
echo "تم إنشاء الحزمة: $OUTPUT_DIR/$BUNDLE_NAME"
echo "انقلها إلى الجهاز الجديد ثم استخرجها وشغّل من داخل المجلد المستخرج:"
echo "  ./deploy/install-from-bundle.sh"
echo ""
echo "ملاحظة: الخدمات النظامية (Jellyfin، MistServer) غير مشمولة؛ راجع DEPLOY_MANIFEST.md."
