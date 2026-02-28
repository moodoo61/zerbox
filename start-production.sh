#!/bin/bash
# تشغيل المشروع في طور الإنتاج
# يبني الواجهة الأمامية ثم يشغّل الخادم فقط (بدون --reload)

set -e
cd "$(dirname "$0")"

BACKEND_PORT="${BACKEND_PORT:-8000}"

echo "=========================================="
echo "  بناء وتشغيل المشروع (طور الإنتاج)"
echo "=========================================="

echo "[1/2] بناء الواجهة الأمامية..."
cd frontend
npm run build
cd ..

echo "[2/2] تشغيل الخادم على المنفذ $BACKEND_PORT..."
echo "  الواجهة والـ API: http://0.0.0.0:$BACKEND_PORT"
echo "  (سيصدر الخادم صفارة beep عند جاهزية النظام)"
echo "=========================================="

exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
