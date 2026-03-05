
#!/bin/bash
# تثبيت وحدات systemd (zero و zero-network-helper) مع مسار المشروع الحالي
# الاستخدام: من جذر المشروع: ./deploy/install-services.sh
# أو: ZERO_ROOT=/path/to/Zero ./deploy/install-services.sh

set -e
ZERO_ROOT="${ZERO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ZERO_ROOT="$(cd "$ZERO_ROOT" && pwd)"

echo "=========================================="
echo "  تثبيت خدمات Zero (systemd)"
echo "  مسار المشروع: $ZERO_ROOT"
echo "=========================================="

for name in zero zero-network-helper; do
  src="$ZERO_ROOT/deploy/${name}.service"
  if [ ! -f "$src" ]; then
    echo "تحذير: الملف غير موجود: $src"
    continue
  fi
  # استبدال المسار الافتراضي بمسار المشروع الفعلي
  sed -e "s|/root/Zero|$ZERO_ROOT|g" "$src" > "/tmp/${name}.service"
  sudo cp "/tmp/${name}.service" "/etc/systemd/system/${name}.service"
  rm -f "/tmp/${name}.service"
  echo "  تم نسخ: $name.service"
done

sudo systemctl daemon-reload
echo ""
echo "تفعيل التشغيل التلقائي وتشغيل الخدمات..."
for name in zero zero-network-helper; do
  if [ -f "/etc/systemd/system/${name}.service" ]; then
    if sudo systemctl enable "$name" 2>/dev/null; then echo "  تم تفعيل: $name"; else echo "  تحذير: فشل enable $name"; fi
    if sudo systemctl start "$name" 2>/dev/null; then echo "  تم تشغيل: $name"; else echo "  تحذير: فشل start $name"; fi
  fi
done
echo ""
echo "تم التثبيت والتفعيل."
echo "  للتحقق: sudo systemctl status zero zero-network-helper"
echo "=========================================="