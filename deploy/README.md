# نشر الخدمات (systemd)

لتفاصيل **رفع المشروع على GitHub** والتثبيت على أجهزة متعددة، راجع: [docs/GITHUB_AND_DEPLOY.md](../docs/GITHUB_AND_DEPLOY.md).

---

## zero — تشغيل التطبيق تلقائياً عند الإقلاع

خدمة تشغّل تطبيق Zero (الواجهة + API) عند تشغيل الجهاز.

### المتطلبات

- أن تكون الواجهة الأمامية مُبنية مسبقاً (مرة واحدة على الأقل):
  ```bash
  cd /root/Zero && ./start-production.sh
  ```
  أو: `cd /root/Zero/frontend && npm run build`
- Python 3 واعتماديات المشروع (`pip install -r backend/requirements.txt`)

### التثبيت والتشغيل التلقائي

```bash
# 1) نسخ وحدة systemd (مع مسار المشروع الحالي تلقائياً)
./deploy/install-services.sh

# أو يدوياً: إذا كان المشروع في مسار غير /root/Zero، عدّل WorkingDirectory و ExecStart:
# sudo cp deploy/zero.service /etc/systemd/system/
# ثم عدّل المسارات داخل الملف، أو استخدم: ZERO_ROOT=/path/to/Zero ./deploy/install-services.sh

# 2) إعادة تحميل systemd وتفعيل الخدمة
sudo systemctl daemon-reload
sudo systemctl enable zero
sudo systemctl start zero
sudo systemctl status zero
```

بعدها يعمل التطبيق تلقائياً عند كل إقلاع. الواجهة والـ API على المنفذ 8000.

أوامر مفيدة:
- `sudo systemctl stop zero` — إيقاف
- `sudo systemctl restart zero` — إعادة تشغيل
- `journalctl -u zero -f` — متابعة السجلات

---

## zero-network-helper (إعدادات الشبكة بصلاحيات root)

خدمة وسيطة تعمل كـ root وتطبق أوامر nmcli (DHCP/Static). تطبيق FastAPI يتواصل معها عبر مقبس Unix ولا يحتاج صلاحيات root.

### المتطلبات (قبل التثبيت)

- **NetworkManager** — إذا ظهرت رسالة «nmcli غير موجود» فالخدمة تحتاج تثبيته:
  ```bash
  sudo apt update
  sudo apt install -y network-manager
  ```
- Python 3
- تشغيل الخدمة كـ root (يُدار عبر systemd)

### التثبيت

```bash
# 1) تثبيت NetworkManager إن لم يكن مثبتاً (انظر المتطلبات أعلاه)

# 2) نسخ وحدة systemd (يُفضّل استخدام سكربت التثبيت لتعيين المسار تلقائياً)
./deploy/install-services.sh

# أو يدوياً: sudo cp deploy/zero-network-helper.service /etc/systemd/system/
# ثم عدّل WorkingDirectory و ExecStart إذا كان المشروع في مسار غير /root/Zero

# 3) تفعيل وتشغيل الخدمة
sudo systemctl daemon-reload
sudo systemctl enable zero-network-helper
sudo systemctl start zero-network-helper
sudo systemctl status zero-network-helper
```

### واي فاي هوتسبوت (ZeroLAG)

الخدمة الوسيطة تدعم تفعيل بطاقة الواي فاي كـ **Hotspot** عبر الـ API:

- **SSID:** ZeroLAG (أو مخصص)
- **بدون كلمة مرور**
- **DHCP:** البوابة 192.168.60.1، رنج 192.168.60.0/24

من لوحة التحكم (تبويب الشبكة) أو عبر الـ API:

- `GET /api/network/wifi-hotspot` — حالة الهوتسبوت
- `POST /api/network/wifi-hotspot/start` — body: `{"ifname": "wlan0"}` (واختياري: ssid, gateway)
- `POST /api/network/wifi-hotspot/stop` — إيقاف الهوتسبوت

يجب أن تكون خدمة **zero-network-helper** مشغّلة وأن تدعم بطاقة الواي فاي وضع AP (Access Point).

**إذا لم تظهر شبكة ZeroLAG عند البحث عنها:**

1. **التحقق من دعم وضع AP:**
   ```bash
   nmcli -f WIFI-PROPERTIES.AP device show wlan0
   ```
   يجب أن يظهر `WIFI-PROPERTIES.AP: yes`. إن ظهر `no` فالبطاقة أو التعريف لا يدعم نقطة الوصول.

2. **فصل الواجهة عن أي شبكة أخرى:** إن كانت البطاقة متصلة كـ عميل بشبكة واي فاي أخرى، يجب فصلها أولاً (يتم تلقائياً عند تشغيل الهوتسبوت عبر الـ API، لكن إن شغّلته يدوياً نفّذ: `sudo nmcli device disconnect wlan0`).

3. **مراجعة السجلات عند الفشل:**
   ```bash
   journalctl -u zero-network-helper -n 50 --no-pager
   ```
   أو تشغيل الهوتسبوت يدوياً لرؤية الخطأ:
   ```bash
   sudo nmcli connection delete ZeroLAG-Hotspot 2>/dev/null
   sudo nmcli connection add type wifi ifname wlp58s0 con-name ZeroLAG-Hotspot autoconnect no ssid ZeroLAG
   sudo nmcli connection modify ZeroLAG-Hotspot remove 802-11-wireless-security
   sudo nmcli connection modify ZeroLAG-Hotspot 802-11-wireless.mode ap 802-11-wireless.band bg ipv4.method shared ipv4.addresses 192.168.60.1/24 802-11-wireless-security.key-mgmt none
   sudo nmcli connection up ZeroLAG-Hotspot
   ```
   (استبدل `wlp58s0` باسم واجهة الواي فاي لديك إن لزم.)
