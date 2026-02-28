#!/bin/bash
# إصلاحات بعد نسخ القرص (سناب شوت / Image) إلى جهاز جديد
# يُشغّل محلياً على الجهاز الجديد — لا يحتاج إنترنت للخطوات الأساسية
# الاستخدام: sudo ./deploy/post-clone-fixes.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}يرجى التشغيل بصلاحيات root: sudo $0${NC}"
  exit 1
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  إصلاحات ما بعد نسخ القرص (Post-Clone)${NC}"
echo -e "${CYAN}  هوية + شبكة (دائمة) + L2TP + SSH + تحديثات${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

# ─────────────────────────────────────────
# 1) إعادة توليد machine-id
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[1/8] إعادة توليد machine-id و D-Bus machine-id...${NC}"
rm -f /etc/machine-id /var/lib/dbus/machine-id 2>/dev/null || true
systemd-machine-id-setup
echo -e "      ${GREEN}تم.${NC} $(cat /etc/machine-id)"

# ─────────────────────────────────────────
# 2) Hostname
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[2/8] تعيين اسم الجهاز (hostname)...${NC}"
CURRENT=$(hostname 2>/dev/null || echo "")
echo -e "      الاسم الحالي: ${YELLOW}${CURRENT}${NC}"
read -p "      ادخل اسم الجهاز الجديد [${CURRENT}]: " NEW_HOST
NEW_HOST="${NEW_HOST:-$CURRENT}"
if [ -n "$NEW_HOST" ]; then
  hostnamectl set-hostname "$NEW_HOST" 2>/dev/null || hostname "$NEW_HOST"
  sed -i "/127.0.1.1/d" /etc/hosts 2>/dev/null || true
  echo "127.0.1.1	$NEW_HOST" >> /etc/hosts
  echo -e "      ${GREEN}تم تعيين الاسم: $NEW_HOST${NC}"
fi

# ─────────────────────────────────────────
# 3) قراءة الرقم التسلسلي للجهاز الجديد
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[3/8] قراءة هوية الجهاز الجديد...${NC}"
NEW_SERIAL=$(cat /sys/class/dmi/id/product_serial 2>/dev/null || echo "")
NEW_UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo "")

# تنظيف القيم الفارغة/الافتراضية
for BAD_VAL in "" "None" "NA" "Default string" "Default String" "DEFAULT STRING" "To Be Filled By O.E.M." "TO BE FILLED BY O.E.M." "Not Specified" "System Serial Number"; do
  [ "$NEW_SERIAL" = "$BAD_VAL" ] && NEW_SERIAL=""
  [ "$NEW_UUID" = "$BAD_VAL" ] && NEW_UUID=""
done

if [ -n "$NEW_SERIAL" ]; then
  echo -e "      الرقم التسلسلي: ${BOLD}${GREEN}${NEW_SERIAL}${NC}"
else
  echo -e "      ${YELLOW}الجهاز لا يحتوي رقم تسلسلي في البيوس${NC}"
  echo -e "      ${YELLOW}يمكنك إدخال رقم يدوياً (أو اضغط Enter للتخطي):${NC}"
  read -p "      الرقم التسلسلي: " NEW_SERIAL
fi
if [ -n "$NEW_UUID" ]; then
  echo -e "      UUID: ${GREEN}${NEW_UUID}${NC}"
fi

# ─────────────────────────────────────────
# 4) إصلاح الشبكة — دائم بعد إعادة التشغيل
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[4/8] إصلاح واجهات الشبكة (دائم)...${NC}"

# 4a) تعطيل cloud-init network (هو السبب الرئيسي في عدم استمرار الشبكة بعد reboot)
echo -e "      ${CYAN}تعطيل cloud-init network config...${NC}"
mkdir -p /etc/cloud/cloud.cfg.d
cat > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg << 'EOF'
network: {config: disabled}
EOF
echo -e "      ${GREEN}تم تعطيل cloud-init network — لن يُعاد توليد إعدادات شبكة قديمة عند الإقلاع${NC}"

# 4b) حذف udev persistent rules القديمة
echo -e "      ${CYAN}حذف قواعد udev القديمة...${NC}"
rm -f /etc/udev/rules.d/70-persistent-net.rules 2>/dev/null || true
rm -f /etc/udev/rules.d/80-net-setup-link.rules 2>/dev/null || true

# 4c) حذف اتصالات NetworkManager القديمة
echo -e "      ${CYAN}حذف اتصالات NetworkManager القديمة...${NC}"
if [ -d /etc/NetworkManager/system-connections ]; then
  CONN_COUNT=$(ls -1 /etc/NetworkManager/system-connections/ 2>/dev/null | wc -l)
  if [ "$CONN_COUNT" -gt 0 ]; then
    echo -e "      وُجدت ${YELLOW}${CONN_COUNT}${NC} اتصالات قديمة — نسخة احتياطية ثم حذف"
    BACKUP_DIR="/etc/NetworkManager/system-connections.backup.$(date +%Y%m%d%H%M)"
    mkdir -p "$BACKUP_DIR"
    cp -a /etc/NetworkManager/system-connections/* "$BACKUP_DIR/" 2>/dev/null || true
    rm -f /etc/NetworkManager/system-connections/* 2>/dev/null || true
    echo -e "      ${GREEN}نسخة احتياطية: ${BACKUP_DIR}${NC}"
  fi
fi

# 4d) ضبط NetworkManager لإدارة جميع الواجهات
NM_CONF="/etc/NetworkManager/NetworkManager.conf"
cat > "$NM_CONF" << 'NMEOF'
[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
NMEOF
echo -e "      ${GREEN}تم ضبط NetworkManager لإدارة جميع الواجهات${NC}"

# 4e) إعادة كتابة netplan — يطابق أي واجهة Ethernet تلقائياً
echo -e "      ${CYAN}إعادة كتابة إعدادات netplan...${NC}"
mkdir -p /etc/netplan

# حذف إعدادات netplan القديمة (تشير لواجهات الجهاز القديم)
rm -f /etc/netplan/*.yaml 2>/dev/null || true

# اكتشاف واجهات Ethernet الفعلية
ETH_IFACES=""
for IFACE in $(ls /sys/class/net/ 2>/dev/null); do
  [ "$IFACE" = "lo" ] && continue
  [ -d "/sys/class/net/${IFACE}/wireless" ] && continue
  [[ "$IFACE" == wl* ]] && continue
  ETH_IFACES="${ETH_IFACES} ${IFACE}"
done

# إنشاء ملف netplan جديد يناسب الجهاز الجديد
{
echo "network:"
echo "    version: 2"
echo "    renderer: NetworkManager"
echo "    ethernets:"
for IFACE in $ETH_IFACES; do
  echo "        ${IFACE}:"
  echo "            dhcp4: true"
done
if [ -z "$ETH_IFACES" ]; then
  echo "        {}"
fi
} > /etc/netplan/01-network-manager.yaml

echo -e "      ${GREEN}تم إنشاء /etc/netplan/01-network-manager.yaml بواجهات الجهاز الجديد${NC}"
cat /etc/netplan/01-network-manager.yaml | while read -r line; do
  echo -e "        ${line}"
done

# 4f) إعادة تحميل udev
echo -e "      ${CYAN}إعادة تحميل udev...${NC}"
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=net 2>/dev/null || true
sleep 2

# 4g) تطبيق netplan وإعادة تشغيل NetworkManager
echo -e "      ${CYAN}تطبيق netplan وإعادة تشغيل NetworkManager...${NC}"
netplan generate 2>/dev/null || true
netplan apply 2>/dev/null || true
sleep 2
systemctl restart NetworkManager 2>/dev/null || systemctl restart networking 2>/dev/null || true
sleep 3

# 4h) إنشاء اتصالات NM جديدة كـ fallback
echo -e "      ${CYAN}اكتشاف واجهات الشبكة وإنشاء اتصالات...${NC}"
echo ""

IFACES_FOUND=0
for IFACE in $(ls /sys/class/net/ 2>/dev/null); do
  [ "$IFACE" = "lo" ] && continue

  if [ -d "/sys/class/net/${IFACE}/wireless" ] || [[ "$IFACE" == wl* ]]; then
    ITYPE="wifi"
  else
    ITYPE="ethernet"
  fi

  MAC=$(cat "/sys/class/net/${IFACE}/address" 2>/dev/null || echo "??:??:??:??:??:??")
  STATE=$(cat "/sys/class/net/${IFACE}/operstate" 2>/dev/null || echo "unknown")
  echo -e "        ${YELLOW}${IFACE}${NC} — ${ITYPE} — MAC: ${MAC} — حالة: ${STATE}"

  if [ "$ITYPE" = "ethernet" ]; then
    CONN_NAME="Auto-${IFACE}"
    # تحقق أن الاتصال غير موجود مسبقاً
    if ! nmcli connection show "$CONN_NAME" >/dev/null 2>&1; then
      nmcli connection add type ethernet con-name "$CONN_NAME" ifname "$IFACE" \
        autoconnect yes ipv4.method auto 2>/dev/null && \
        echo -e "        ${GREEN}  ← تم إنشاء اتصال DHCP: ${CONN_NAME}${NC}" || true
    fi
  fi
  IFACES_FOUND=$((IFACES_FOUND + 1))
done

echo ""
echo -e "      ${GREEN}تم اكتشاف ${IFACES_FOUND} واجهة/واجهات${NC}"

# 4i) رفع الواجهات
echo ""
echo -e "      ${CYAN}تفعيل الواجهات وطلب عناوين IP...${NC}"
for IFACE in $(ls /sys/class/net/ 2>/dev/null); do
  [ "$IFACE" = "lo" ] && continue
  [ -d "/sys/class/net/${IFACE}/wireless" ] && continue
  [[ "$IFACE" == wl* ]] && continue

  ip link set "$IFACE" up 2>/dev/null || true
  CONN_NAME="Auto-${IFACE}"
  nmcli connection up "$CONN_NAME" 2>/dev/null && \
    echo -e "        ${GREEN}${IFACE}: تم التفعيل${NC}" || true

  if ! ip addr show "$IFACE" 2>/dev/null | grep -q "inet "; then
    dhclient "$IFACE" 2>/dev/null || true
  fi
done
sleep 3

# 4j) عرض النتيجة
echo ""
echo -e "      ${CYAN}حالة الواجهات بعد الإصلاح:${NC}"
echo "      ────────────────────────────────────"
ip -br addr show 2>/dev/null | while read -r line; do
  echo "        $line"
done
echo "      ────────────────────────────────────"

echo ""
if ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1; then
  echo -e "      ${GREEN}✓ الاتصال بالإنترنت يعمل${NC}"
else
  echo -e "      ${YELLOW}✗ لا يوجد اتصال بالإنترنت — تحقق من كابل الشبكة${NC}"
fi

# ─────────────────────────────────────────
# 5) تحديث بيانات L2TP VPN بالرقم التسلسلي الجديد
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[5/8] تحديث بيانات اتصال L2TP VPN...${NC}"

L2TP_BACKUP_DIR="/etc/NetworkManager/system-connections.backup."*
L2TP_FILE=""
L2TP_GATEWAY=""

# البحث عن ملف L2TP في النسخة الاحتياطية
for BDIR in /etc/NetworkManager/system-connections.backup.*; do
  [ -d "$BDIR" ] || continue
  for F in "$BDIR"/*; do
    if grep -q "service-type=org.freedesktop.NetworkManager.l2tp" "$F" 2>/dev/null; then
      L2TP_FILE="$F"
      L2TP_GATEWAY=$(grep "^gateway=" "$F" 2>/dev/null | head -1 | cut -d= -f2)
      break 2
    fi
  done
done

if [ -n "$L2TP_FILE" ] && [ -n "$NEW_SERIAL" ]; then
  echo -e "      وُجد اتصال L2TP قديم: ${YELLOW}$(basename "$L2TP_FILE")${NC}"
  echo -e "      السيرفر: ${YELLOW}${L2TP_GATEWAY}${NC}"
  OLD_USER=$(grep "^user=" "$L2TP_FILE" 2>/dev/null | head -1 | cut -d= -f2)
  echo -e "      المستخدم القديم: ${RED}${OLD_USER}${NC}"
  echo -e "      المستخدم الجديد: ${GREEN}${NEW_SERIAL}${NC}"

  # إنشاء اتصال L2TP جديد بالرقم التسلسلي الجديد
  L2TP_CONN="Zero-L2TP"
  L2TP_DEST="/etc/NetworkManager/system-connections/${L2TP_CONN}.nmconnection"

  cat > "$L2TP_DEST" << VPNEOF
[connection]
id=${L2TP_CONN}
type=vpn
autoconnect=false

[vpn]
gateway=${L2TP_GATEWAY}
ipsec-enabled=yes
ipsec-psk=${NEW_SERIAL}
password-flags=0
user=${NEW_SERIAL}
service-type=org.freedesktop.NetworkManager.l2tp

[vpn-secrets]
password=${NEW_SERIAL}

[ipv4]
method=auto

[ipv6]
method=auto
VPNEOF

  chmod 600 "$L2TP_DEST"
  echo -e "      ${GREEN}تم إنشاء اتصال VPN جديد: ${L2TP_CONN} بالرقم التسلسلي الجديد${NC}"
elif [ -n "$L2TP_FILE" ] && [ -z "$NEW_SERIAL" ]; then
  echo -e "      ${YELLOW}وُجد اتصال L2TP لكن لا يوجد رقم تسلسلي — يرجى تحديثه يدوياً${NC}"
else
  echo -e "      ${YELLOW}لم يوجد اتصال L2TP — تخطي${NC}"
fi

# إعادة تحميل NM لتطبيق اتصال VPN الجديد
nmcli connection reload 2>/dev/null || true

# ─────────────────────────────────────────
# 6) مفاتيح SSH للخادوم
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[6/8] إعادة توليد مفاتيح SSH للخادوم...${NC}"
if [ -d /etc/ssh ]; then
  rm -f /etc/ssh/ssh_host_*
  if command -v dpkg-reconfigure >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive dpkg-reconfigure openssh-server 2>/dev/null || ssh-keygen -A 2>/dev/null || true
  else
    ssh-keygen -A 2>/dev/null || true
  fi
  systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
  echo -e "      ${GREEN}تم.${NC}"
else
  echo -e "      ${YELLOW}تخطي (لا يوجد /etc/ssh).${NC}"
fi

# ─────────────────────────────────────────
# 7) التحديثات (تحتاج إنترنت)
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[7/8] تحديث قائمة الحزم وتثبيت التحديثات...${NC}"
if ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get upgrade -y
    echo -e "      ${GREEN}تم.${NC}"
  fi
else
  echo -e "      ${YELLOW}تخطي — لا يوجد اتصال بالإنترنت. شغّل يدوياً: apt update && apt upgrade -y${NC}"
fi

# ─────────────────────────────────────────
# 8) إصلاحات خدمات المشروع
# ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[8/8] إعادة تشغيل خدمات المشروع...${NC}"

# إزالة Captive Portal القديم
rm -f /etc/NetworkManager/dnsmasq-shared.d/captive-portal.conf 2>/dev/null || true

# تنظيف iptables rules القديمة
iptables -t nat -F PREROUTING 2>/dev/null || true

# إعادة تشغيل الخدمات
if systemctl is-enabled zero-network-helper >/dev/null 2>&1; then
  systemctl restart zero-network-helper 2>/dev/null || true
  echo -e "      ${GREEN}zero-network-helper: أعيد تشغيله${NC}"
fi

echo -e "      ${GREEN}تم.${NC}"

# ─────────────────────────────────────────
# ملخص النتائج
# ─────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  ملخص ما تم:${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓${NC} machine-id: جديد"
echo -e "  ${GREEN}✓${NC} hostname: $(hostname)"
echo -e "  ${GREEN}✓${NC} cloud-init network: مُعطّل (لن يُعاد توليد إعدادات قديمة)"
echo -e "  ${GREEN}✓${NC} netplan: أُعيد كتابته بواجهات الجهاز الجديد"
echo -e "  ${GREEN}✓${NC} اتصالات NM القديمة: أُزيلت وأنشئت جديدة"
echo -e "  ${GREEN}✓${NC} مفاتيح SSH: جديدة"
if [ -n "$NEW_SERIAL" ]; then
  echo -e "  ${GREEN}✓${NC} الرقم التسلسلي: ${BOLD}${NEW_SERIAL}${NC}"
  echo -e "  ${GREEN}✓${NC} L2TP VPN: محدّث بالرقم التسلسلي الجديد"
else
  echo -e "  ${YELLOW}!${NC} الرقم التسلسلي: غير متوفر في البيوس"
fi
echo ""
echo -e "  ${BOLD}الشبكة ستستمر بالعمل بعد إعادة التشغيل${NC} (netplan + cloud-init مُصلحان)"
echo ""
echo -e "${YELLOW}  خطوات يدوية (إن لزم):${NC}"
echo -e "  • لإعداد IP ثابت: sudo nmcli connection modify Auto-IFNAME ipv4.method manual ipv4.addresses IP/24 ipv4.gateway GW"
echo -e "  • لتفعيل الهوتسبوت: من واجهة المشروع ← الضبط ← الشبكة"
echo -e "  • تحقق من fstab: ${YELLOW}lsblk -f${NC}"
echo ""
echo -e "${GREEN}  أعد التشغيل الآن:${NC} ${BOLD}sudo reboot${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
