

#!/bin/bash
# تثبيت وحدات systemd (zero و zero-network-helper) مع مسار المشروع الحالي
# + إصلاح netplan لاستخدام NetworkManager (مطلوب لإدارة الشبكة من الواجهة)
# الاستخدام: من جذر المشروع: ./deploy/install-services.sh
# أو: ZERO_ROOT=/path/to/Zero ./deploy/install-services.sh

set -e
ZERO_ROOT="${ZERO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ZERO_ROOT="$(cd "$ZERO_ROOT" && pwd)"

echo "=========================================="
echo "  تثبيت خدمات Zero (systemd)"
echo "  مسار المشروع: $ZERO_ROOT"
echo "=========================================="

# --- إصلاح netplan لاستخدام NetworkManager ---
echo ""
echo "فحص إعدادات الشبكة (netplan / NetworkManager)..."

NM_RENDERER_OK=false
shopt -s nullglob
for f in /etc/netplan/*.yaml; do
  [ -f "$f" ] || continue
  if grep -q "renderer: NetworkManager" "$f" 2>/dev/null; then
    NM_RENDERER_OK=true
    break
  fi
done

if [ "$NM_RENDERER_OK" = false ]; then
  echo "  إصلاح netplan لاستخدام NetworkManager..."

  # تعطيل cloud-init network
  sudo mkdir -p /etc/cloud/cloud.cfg.d
  echo "network: {config: disabled}" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg > /dev/null

  # حذف إعدادات netplan القديمة
  sudo rm -f /etc/netplan/*.yaml 2>/dev/null || true

  # اكتشاف واجهات Ethernet
  ETH_IFACES=""
  for IFACE in $(ls /sys/class/net/ 2>/dev/null); do
    [ "$IFACE" = "lo" ] && continue
    [ -d "/sys/class/net/${IFACE}/wireless" ] && continue
    case "$IFACE" in wl*|ppp*|tun*|wg*|veth*|docker*|br-*) continue;; esac
    ETH_IFACES="${ETH_IFACES} ${IFACE}"
  done

  # إنشاء ملف netplan جديد
  {
    echo "network:"
    echo "    version: 2"
    echo "    renderer: NetworkManager"
    echo "    ethernets:"
    if [ -n "$ETH_IFACES" ]; then
      for IFACE in $ETH_IFACES; do
        echo "        ${IFACE}:"
        echo "            dhcp4: true"
      done
    else
      echo "        {}"
    fi
  } | sudo tee /etc/netplan/01-network-manager.yaml > /dev/null
  sudo chmod 600 /etc/netplan/01-network-manager.yaml

  # تطبيق
  sudo netplan generate 2>/dev/null || true
  sudo netplan apply 2>/dev/null || true
  sleep 2
  sudo systemctl restart NetworkManager 2>/dev/null || true
  sleep 2
  echo "  تم إصلاح netplan — NetworkManager يدير جميع الواجهات الآن."
else
  echo "  netplan يستخدم NetworkManager بالفعل — لا حاجة لإصلاح."
fi

# حذف الاتصالات المكررة
echo "  تنظيف اتصالات NM المكررة..."
if command -v nmcli >/dev/null 2>&1; then
  for IFACE in $(ls /sys/class/net/ 2>/dev/null); do
    [ "$IFACE" = "lo" ] && continue
    [ -d "/sys/class/net/${IFACE}/wireless" ] && continue
    case "$IFACE" in wl*|ppp*|tun*|wg*|veth*|docker*|br-*) continue;; esac
    CONN_COUNT=$(nmcli -t -f NAME connection show 2>/dev/null | grep -c "^${IFACE}$" || true)
    if [ "$CONN_COUNT" -gt 1 ]; then
      FIRST=true
      nmcli -t -f UUID,NAME connection show 2>/dev/null | while IFS=: read -r UUID NAME; do
        if [ "$NAME" = "$IFACE" ]; then
          if [ "$FIRST" = true ]; then FIRST=false; continue; fi
          nmcli connection delete uuid "$UUID" 2>/dev/null || true
        fi
      done
    fi
  done
  echo "  تم."
fi

# --- تثبيت ملفات الخدمة ---
echo ""
for name in zero zero-network-helper; do
  src="$ZERO_ROOT/deploy/${name}.service"
  if [ ! -f "$src" ]; then
    echo "تحذير: الملف غير موجود: $src"
    continue
  fi
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
    if sudo systemctl restart "$name" 2>/dev/null; then echo "  تم تشغيل: $name"; else echo "  تحذير: فشل start $name"; fi
  fi
done
echo ""
echo "تم التثبيت والتفعيل."
echo "  للتحقق: sudo systemctl status zero zero-network-helper"
echo "=========================================="
