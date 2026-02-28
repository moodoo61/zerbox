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
echo "تم التثبيت. لتفعيل التشغيل التلقائي:"
echo "  sudo systemctl enable zero"
echo "  sudo systemctl enable zero-network-helper"
echo "  sudo systemctl start zero"
echo "  sudo systemctl start zero-network-helper"
echo "=========================================="
