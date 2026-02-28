#!/bin/bash
# سكربت تشغيل المشروع (وضع التطوير)
# يشغّل الخادم الخلفي (FastAPI) والواجهة الأمامية (React) معاً

set -e
cd "$(dirname "$0")"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "=========================================="
echo "  تشغيل مشروع Zero (وضع التطوير)"
echo "=========================================="
echo "  الخادم الخلفي:  http://0.0.0.0:${BACKEND_PORT}"
echo "  الواجهة الأمامية: http://localhost:${FRONTEND_PORT}"
echo "=========================================="

# إيقاف أي عملية سابقة على نفس المنافذ (اختياري)
cleanup() {
  echo ""
  echo "إيقاف الخادم الخلفي (PID: $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

# تشغيل الخادم الخلفي في الخلفية
echo "[1/2] تشغيل الخادم الخلفي (uvicorn)..."
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# انتظار قليل حتى يبدأ الخادم (سيصدر الخادم صفارة beep عند جاهزية النظام)
sleep 3

# تشغيل الواجهة الأمامية (في المقدمة - عند إيقافها يتوقف السكربت)
echo "[2/2] تشغيل الواجهة الأمامية (React)..."
cd frontend && npm start
