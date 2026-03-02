#!/bin/bash
# تثبيت الاعتماديات وبناء المشروع بعد استخراج حزمة النشر على جهاز جديد
# يشمل: Backend، Frontend الرئيسي، القرآن الكريم، قافية
# الاستخدام: من جذر المشروع: ./deploy/install-from-bundle.sh

set -e
ZERO_ROOT="${ZERO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ZERO_ROOT"

echo "=========================================="
echo "  تثبيت Zero والمشاريع المرتبطة"
echo "  المسار: $ZERO_ROOT"
echo "=========================================="

# التحقق من إصدار Node.js
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
echo "  Node.js: $NODE_VERSION"
if [ "$NODE_VERSION" = "none" ]; then
  echo "❌ Node.js غير مثبّت. يُرجى تثبيته أولاً:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "   sudo apt install -y nodejs"
  exit 1
fi

NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "⚠️  تحذير: إصدار Node.js ($NODE_VERSION) قديم. المشروع يحتاج v18+ (يُفضّل v22.x)"
  echo "   للتحديث: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
fi

# 1) Backend
echo ""
echo "[1/4] تثبيت اعتماديات Backend (Python)..."
pip3 install -r backend/requirements.txt 2>/dev/null || pip3 install --user -r backend/requirements.txt
echo "  ✅ Backend جاهز"

# 2) Frontend الرئيسي
echo ""
echo "[2/4] تثبيت وبناء الواجهة الأمامية (React)..."
cd "$ZERO_ROOT/frontend"
npm install
echo "      بناء الواجهة الأمامية..."
npm run build
cd "$ZERO_ROOT"
echo "  ✅ الواجهة الأمامية جاهزة"

# 3) القرآن الكريم (Vue 2)
echo ""
if [ -f "$ZERO_ROOT/frontend/quran/package.json" ]; then
  echo "[3/4] تثبيت تطبيق القرآن الكريم (Vue)..."
  cd "$ZERO_ROOT/frontend/quran"
  npm install
  if [ ! -d "dist" ]; then
    echo "      بناء تطبيق القرآن..."
    npm run build 2>/dev/null || echo "      ⚠️ بناء القرآن اختياري — سيعمل عبر serve"
  fi
  cd "$ZERO_ROOT"
  echo "  ✅ القرآن الكريم جاهز"
else
  echo "[3/4] تطبيق القرآن غير موجود — تخطي."
fi

# 4) قافية (pnpm monorepo — Next.js + Turbo)
echo ""
if [ -f "$ZERO_ROOT/qafiyah/package.json" ]; then
  echo "[4/4] تثبيت مشروع قافية (Next.js)..."

  # التحقق من pnpm
  if ! command -v pnpm &>/dev/null; then
    echo "      تثبيت pnpm..."
    npm install -g pnpm@9
  fi

  cd "$ZERO_ROOT/qafiyah"
  pnpm install
  echo "      بناء مشروع قافية..."
  pnpm build 2>/dev/null || echo "      ⚠️ بناء قافية اختياري — سيعمل عبر dev"
  cd "$ZERO_ROOT"
  echo "  ✅ قافية جاهزة"
else
  echo "[4/4] مشروع قافية غير موجود — تخطي."
fi

# 5) التحقق من الحزم المطلوبة للنظام
echo ""
echo "=========================================="
echo "  التحقق من حزم النظام..."
echo "=========================================="
MISSING_PKGS=""
command -v xl2tpd &>/dev/null || MISSING_PKGS="$MISSING_PKGS xl2tpd"
command -v pppd &>/dev/null   || MISSING_PKGS="$MISSING_PKGS ppp"
command -v beep &>/dev/null   || MISSING_PKGS="$MISSING_PKGS beep"
command -v MistController &>/dev/null || MISSING_PKGS="$MISSING_PKGS (MistServer)"

if [ -n "$MISSING_PKGS" ]; then
  echo "  ⚠️ حزم مفقودة:$MISSING_PKGS"
  echo "     لتثبيت xl2tpd و ppp و beep:"
  echo "       sudo apt install -y xl2tpd ppp beep"
  echo "     لتثبيت MistServer:"
  echo "       wget https://releases.mistserver.org/is/mistserver_64V3.4.2.deb -O /tmp/mistserver.deb"
  echo "       sudo dpkg -i /tmp/mistserver.deb"
else
  echo "  ✅ جميع الحزم المطلوبة متوفرة"
fi

echo ""
echo "=========================================="
echo "  ✅ انتهى التثبيت بنجاح."
echo ""
echo "  للتشغيل اليدوي:  $ZERO_ROOT/start-production.sh"
echo ""
echo "  لتثبيت الخدمات التلقائية:"
echo "    $ZERO_ROOT/deploy/install-services.sh"
echo "    sudo systemctl enable --now zero"
echo "    sudo systemctl enable --now zero-network-helper"
echo "    sudo systemctl enable --now xl2tpd"
echo "    sudo systemctl enable --now mistserver"
echo ""
echo "  لوحة التحكم: http://عنوان-الجهاز:8000/admin"
echo "  بيانات الدخول: admin / admin"
echo "=========================================="
