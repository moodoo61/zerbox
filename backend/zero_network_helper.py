#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zero Network Helper — خدمة وسيطة تعمل بصلاحيات root.
مسؤولة فقط عن: تغيير DHCP/Static، وتطبيق إعدادات الشبكة عبر nmcli.
تستمع على مقبس Unix؛ تطبيق FastAPI يتواصل معها دون الحاجة لصلاحيات root.

تشغيل كـ systemd service:
  sudo systemctl start zero-network-helper
  sudo systemctl enable zero-network-helper
"""
import socket
import json
import os
import sys
import subprocess

SOCKET_PATH = "/run/zero-network-helper.sock"
NMCLI = os.environ.get("NMCLI", "/usr/bin/nmcli")
CAPTIVE_PORTAL_CONF = "/etc/NetworkManager/dnsmasq-shared.d/captive-portal.conf"
IPTABLES = "/usr/sbin/iptables"
PROJECT_PORT = 8000


def _run(cmd, timeout=15):
    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "LANG": "C"},
        )
        return r.returncode == 0, (r.stdout or "").strip(), (r.stderr or "").strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        return False, "", str(e)


def _get_conn_name(ifname):
    ok, out, _ = _run([NMCLI, "-t", "-f", "NAME,DEVICE", "connection", "show"])
    if not ok or not out:
        return None
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) >= 2 and parts[1].strip() == ifname:
            return parts[0].strip()
    return None


def cmd_set_static(payload):
    ifname = (payload.get("ifname") or "").strip()
    address = (payload.get("address") or "").strip()
    prefix = int(payload.get("prefix") or 24)
    gateway = (payload.get("gateway") or "").strip() or None
    dns = (payload.get("dns") or "").strip() or None
    if not ifname or not address:
        return {"ok": False, "message": "ifname و address مطلوبان"}
    conn_name = _get_conn_name(ifname)
    if not conn_name:
        ok_new, out_new, err_new = _run([
            NMCLI, "connection", "add",
            "type", "ethernet",
            "con-name", ifname,
            "ifname", ifname,
        ])
        if not ok_new:
            return {"ok": False, "message": out_new or err_new or "فشل إنشاء الاتصال"}
        conn_name = ifname
    addr_str = f"{address}/{prefix}"
    cmds = [
        [NMCLI, "connection", "modify", conn_name, "ipv4.method", "manual"],
        [NMCLI, "connection", "modify", conn_name, "ipv4.addresses", addr_str],
    ]
    if gateway:
        cmds.append([NMCLI, "connection", "modify", conn_name, "ipv4.gateway", gateway])
    if dns:
        cmds.append([NMCLI, "connection", "modify", conn_name, "ipv4.dns", dns])
    cmds.append([NMCLI, "connection", "up", conn_name])
    for cmd in cmds:
        ok, out, err = _run(cmd)
        if not ok:
            return {"ok": False, "message": out or err or "فشل تنفيذ الأمر"}
    return {"ok": True, "message": "تم تطبيق الإعدادات بنجاح"}


def cmd_set_dhcp(payload):
    ifname = (payload.get("ifname") or "").strip()
    if not ifname:
        return {"ok": False, "message": "ifname مطلوب"}
    conn_name = _get_conn_name(ifname)
    if not conn_name:
        ok_new, out_new, err_new = _run([
            NMCLI, "connection", "add",
            "type", "ethernet",
            "con-name", ifname,
            "ifname", ifname,
        ])
        if not ok_new:
            return {"ok": False, "message": out_new or err_new or "فشل إنشاء الاتصال"}
        conn_name = ifname
    ok, out, err = _run([NMCLI, "connection", "modify", conn_name, "ipv4.method", "auto"])
    if not ok:
        return {"ok": False, "message": out or err or "فشل تعديل الطريقة"}
    ok2, out2, err2 = _run([NMCLI, "connection", "up", conn_name])
    if not ok2:
        return {"ok": False, "message": out2 or err2 or "فشل تفعيل الاتصال"}
    return {"ok": True, "message": "تم تفعيل DHCP بنجاح"}


def cmd_restart_network(_payload):
    """إعادة تشغيل NetworkManager (يقطع الاتصال مؤقتاً)."""
    ok, out, err = _run(["systemctl", "restart", "NetworkManager"], timeout=30)
    if not ok:
        return {"ok": False, "message": out or err or "فشل إعادة تشغيل الشبكة"}
    return {"ok": True, "message": "تم إعادة تشغيل خدمة الشبكة"}


# اسم اتصال الهوتسبوت الافتراضي (ZeroLAG)
HOTSPOT_CONNECTION_NAME = "ZeroLAG-Hotspot"


def _setup_captive_portal(ifname, gateway_ip):
    """
    Captive Portal: توجيه المتصلين تلقائياً لواجهة المشروع.
    1) DNS hijack — كل استعلام DNS يُرجع IP البوابة
    2) iptables — إعادة توجيه HTTP (80) إلى بورت المشروع
    """
    gw = gateway_ip.split("/")[0] if "/" in gateway_ip else gateway_ip

    # 1) dnsmasq config: resolve all domains to our gateway
    os.makedirs(os.path.dirname(CAPTIVE_PORTAL_CONF), exist_ok=True)
    with open(CAPTIVE_PORTAL_CONF, "w") as f:
        f.write(f"address=/#/{gw}\n")

    # 2) iptables: redirect port 80 -> project port
    _run([IPTABLES, "-t", "nat", "-D", "PREROUTING",
          "-i", ifname, "-p", "tcp", "--dport", "80",
          "-j", "DNAT", "--to-destination", f"{gw}:{PROJECT_PORT}"], timeout=5)
    _run([IPTABLES, "-t", "nat", "-A", "PREROUTING",
          "-i", ifname, "-p", "tcp", "--dport", "80",
          "-j", "DNAT", "--to-destination", f"{gw}:{PROJECT_PORT}"], timeout=5)

    # 3) reload NM's dnsmasq to pick up the new config
    _run(["systemctl", "reload", "NetworkManager"], timeout=10)


def _teardown_captive_portal(ifname, gateway_ip):
    """إزالة إعدادات Captive Portal."""
    gw = gateway_ip.split("/")[0] if "/" in gateway_ip else gateway_ip
    try:
        os.remove(CAPTIVE_PORTAL_CONF)
    except FileNotFoundError:
        pass
    _run([IPTABLES, "-t", "nat", "-D", "PREROUTING",
          "-i", ifname, "-p", "tcp", "--dport", "80",
          "-j", "DNAT", "--to-destination", f"{gw}:{PROJECT_PORT}"], timeout=5)
    _run(["systemctl", "reload", "NetworkManager"], timeout=10)


def cmd_wifi_hotspot_start(payload):
    """
    تفعيل واي فاي كـ Hotspot:
    - SSID: ZeroLAG (أو من payload)
    - بدون كلمة مرور (شبكة مفتوحة)
    - DHCP من 192.168.60.1 (رنج 192.168.60.0/24)
    """
    ifname = (payload.get("ifname") or "").strip()
    ssid = (payload.get("ssid") or "ZeroLAG").strip()
    gateway = (payload.get("gateway") or "192.168.60.1").strip()
    if not ifname:
        return {"ok": False, "message": "ifname مطلوب (مثال: wlan0)"}
    if "/" not in gateway:
        gateway = gateway + "/24"
    conn_name = payload.get("connection_name") or HOTSPOT_CONNECTION_NAME

    # 1) فصل الواجهة عن أي اتصال حالي (كي تعمل كـ AP)
    _run([NMCLI, "device", "disconnect", ifname], timeout=10)

    # 2) إزالة اتصال قديم بنفس الاسم إن وُجد
    _run([NMCLI, "connection", "delete", conn_name], timeout=5)

    # 3) إنشاء اتصال واي فاي عادي أولاً (بدون وضع AP في الأمر الأول — يتوافق مع المزيد من الإصدارات)
    ok_add, out_add, err_add = _run([
        NMCLI, "connection", "add",
        "type", "wifi",
        "ifname", ifname,
        "con-name", conn_name,
        "autoconnect", "no",
        "ssid", ssid,
    ], timeout=15)
    if not ok_add:
        return {"ok": False, "message": out_add or err_add or "فشل إنشاء اتصال الهوتسبوت"}

    # 4) تعديل الاتصال: وضع AP، نطاق 2.4GHz، DHCP مشترك
    #    لا نُضيف أي إعدادات 802-11-wireless-security — شبكة مفتوحة بالكامل
    ok_mod, out_mod, err_mod = _run([
        NMCLI, "connection", "modify", conn_name,
        "802-11-wireless.mode", "ap",
        "802-11-wireless.band", "bg",
        "ipv4.method", "shared",
        "ipv4.addresses", gateway,
    ], timeout=15)
    if not ok_mod:
        return {"ok": False, "message": out_mod or err_mod or "فشل تعديل إعدادات الهوتسبوت"}

    # 5) تفعيل الاتصال (إطلاق البث)
    ok_up, out_up, err_up = _run([NMCLI, "connection", "up", conn_name], timeout=30)
    if not ok_up:
        return {"ok": False, "message": out_up or err_up or "فشل تفعيل الهوتسبوت. تحقق أن البطاقة تدعم وضع AP: nmcli -f WIFI-PROPERTIES.AP device show " + ifname}

    # 6) Captive Portal: توجيه المتصلين تلقائياً لواجهة المشروع
    _setup_captive_portal(ifname, gateway)

    return {"ok": True, "message": f"تم تفعيل الهوتسبوت {ssid} على {ifname}. البوابة: {gateway.split('/')[0]}. ابحث عن الشبكة ZeroLAG من جهازك."}


def cmd_wifi_hotspot_stop(payload):
    """إيقاف الهوتسبوت وإزالة Captive Portal."""
    conn_name = (payload.get("connection_name") or HOTSPOT_CONNECTION_NAME).strip()

    # جلب بيانات الواجهة و IP قبل الإيقاف لإزالة iptables
    ifname = ""
    gw = "192.168.60.1"
    ok_info, out_info, _ = _run([NMCLI, "-t", "-f",
        "GENERAL.DEVICES,IP4.ADDRESS", "connection", "show", conn_name])
    if ok_info and out_info:
        for line in out_info.splitlines():
            if "DEVICES" in line and ":" in line:
                ifname = line.split(":", 1)[1].strip()
            elif "IP4.ADDRESS" in line and ":" in line:
                val = line.split(":", 1)[1].strip()
                if "/" in val:
                    gw = val.split("/")[0]

    ok, out, err = _run([NMCLI, "connection", "down", conn_name], timeout=15)

    # إزالة Captive Portal
    if ifname:
        _teardown_captive_portal(ifname, gw)

    if not ok:
        return {"ok": True, "message": "الهوتسبوت غير مفعّل أو تم إيقافه"}
    return {"ok": True, "message": "تم إيقاف الهوتسبوت"}


def cmd_wifi_hotspot_status(payload):
    """التحقق من حالة الهوتسبوت مع تفاصيل IP والواجهة والـ SSID."""
    conn_name = (payload.get("connection_name") or HOTSPOT_CONNECTION_NAME).strip()
    ok, out, _ = _run([NMCLI, "-t", "-f", "NAME,STATE", "connection", "show", "--active"])
    active = False
    if ok and out:
        for line in out.splitlines():
            parts = line.split(":")
            if len(parts) >= 2 and parts[0].strip() == conn_name:
                active = parts[1].strip().lower() == "activated"
                break

    if not active:
        return {"ok": True, "active": False, "message": "غير مفعّل"}

    details = {"ssid": "", "ifname": "", "ip": "", "gateway": "", "mac": "", "band": ""}
    ok2, out2, _ = _run([NMCLI, "-t", "-f",
        "802-11-wireless.ssid,GENERAL.DEVICES,IP4.ADDRESS,IP4.GATEWAY,802-11-wireless.band",
        "connection", "show", conn_name])
    if ok2 and out2:
        for line in out2.splitlines():
            if ":" not in line:
                continue
            key, _, val = line.partition(":")
            val = val.strip()
            if "ssid" in key.lower():
                details["ssid"] = val
            elif "DEVICES" in key:
                details["ifname"] = val
            elif "IP4.ADDRESS" in key:
                details["ip"] = val
                if "/" in val:
                    details["gateway"] = val.split("/")[0]
            elif "IP4.GATEWAY" in key and val:
                details["gateway"] = val
            elif "band" in key.lower():
                details["band"] = val

    # MAC من الجهاز نفسه
    if details["ifname"]:
        ok3, out3, _ = _run([NMCLI, "-t", "-f", "GENERAL.HWADDR",
                             "device", "show", details["ifname"]])
        if ok3 and out3:
            for line in out3.splitlines():
                if "HWADDR" in line and ":" in line:
                    details["mac"] = line.split(":", 1)[1].strip()
                    break

    return {"ok": True, "active": True, "message": "مفعّل", "details": details}


def cmd_wifi_hotspot_clients(payload):
    """جلب قائمة الأجهزة المتصلة بالهوتسبوت عبر iw station dump + DHCP leases."""
    conn_name = (payload.get("connection_name") or HOTSPOT_CONNECTION_NAME).strip()

    # تحديد الواجهة
    ifname = ""
    ok, out, _ = _run([NMCLI, "-t", "-f", "GENERAL.DEVICES", "connection", "show", conn_name])
    if ok and out:
        for line in out.splitlines():
            if "DEVICES" in line and ":" in line:
                ifname = line.split(":", 1)[1].strip()
                break

    clients = []

    # 1) iw station dump — الأجهزة المتصلة على مستوى WiFi
    station_macs = set()
    if ifname:
        ok_iw, out_iw, _ = _run(["iw", "dev", ifname, "station", "dump"], timeout=10)
        if ok_iw and out_iw:
            current = {}
            for line in out_iw.splitlines():
                line = line.strip()
                if line.startswith("Station "):
                    if current.get("mac"):
                        clients.append(current)
                        station_macs.add(current["mac"].lower())
                    mac = line.split()[1] if len(line.split()) > 1 else ""
                    current = {"mac": mac, "ip": "", "hostname": "", "signal": "", "rx_bytes": 0, "tx_bytes": 0, "connected_time": ""}
                elif "signal:" in line.lower():
                    current["signal"] = line.split(":", 1)[1].strip()
                elif "rx bytes:" in line.lower():
                    try:
                        current["rx_bytes"] = int(line.split(":", 1)[1].strip())
                    except ValueError:
                        pass
                elif "tx bytes:" in line.lower():
                    try:
                        current["tx_bytes"] = int(line.split(":", 1)[1].strip())
                    except ValueError:
                        pass
                elif "connected time:" in line.lower():
                    current["connected_time"] = line.split(":", 1)[1].strip()
            if current.get("mac"):
                clients.append(current)
                station_macs.add(current["mac"].lower())

    # 2) DHCP leases — ربط MAC بـ IP واسم الجهاز
    lease_map = {}
    lease_paths = [
        "/var/lib/NetworkManager/dnsmasq-" + ifname + ".leases",
        "/var/lib/misc/dnsmasq.leases",
    ]
    import glob as _glob
    lease_paths += _glob.glob("/var/lib/NetworkManager/dnsmasq-*.leases")
    for lpath in lease_paths:
        try:
            with open(lpath, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 4:
                        mac_addr = parts[1].lower()
                        ip_addr = parts[2]
                        hostname = parts[3] if parts[3] != "*" else ""
                        lease_map[mac_addr] = {"ip": ip_addr, "hostname": hostname}
        except (FileNotFoundError, PermissionError):
            continue

    for c in clients:
        info = lease_map.get(c["mac"].lower(), {})
        if not c["ip"]:
            c["ip"] = info.get("ip", "")
        if not c["hostname"]:
            c["hostname"] = info.get("hostname", "")

    return {"ok": True, "clients": clients, "count": len(clients)}


def handle_request(data):
    try:
        msg = json.loads(data)
    except json.JSONDecodeError:
        return json.dumps({"ok": False, "message": "طلب غير صالح"})
    cmd = (msg.get("cmd") or "").strip().lower()
    payload = msg.get("payload") or msg
    if cmd == "set_static":
        out = cmd_set_static(payload)
    elif cmd == "set_dhcp":
        out = cmd_set_dhcp(payload)
    elif cmd == "restart_network":
        out = cmd_restart_network(payload)
    elif cmd == "wifi_hotspot_start":
        out = cmd_wifi_hotspot_start(payload)
    elif cmd == "wifi_hotspot_stop":
        out = cmd_wifi_hotspot_stop(payload)
    elif cmd == "wifi_hotspot_status":
        out = cmd_wifi_hotspot_status(payload)
    elif cmd == "wifi_hotspot_clients":
        out = cmd_wifi_hotspot_clients(payload)
    else:
        out = {"ok": False, "message": f"أمر غير معروف: {cmd}"}
    return json.dumps(out, ensure_ascii=False)


def main():
    if os.geteuid() != 0:
        print("يجب تشغيل هذه الخدمة كـ root (عبر systemd).", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(NMCLI) or not os.access(NMCLI, os.X_OK):
        print("nmcli غير موجود. يلزم تثبيت NetworkManager.", file=sys.stderr)
        sys.exit(1)
    sock_dir = os.path.dirname(SOCKET_PATH)
    if sock_dir and not os.path.isdir(sock_dir):
        os.makedirs(sock_dir, mode=0o755, exist_ok=True)
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o666)  # يسمح لجميع المستخدمين المحليين بالاتصال
    server.listen(5)
    server.settimeout(1.0)
    while True:
        try:
            conn, _ = server.accept()
        except socket.timeout:
            continue
        except KeyboardInterrupt:
            break
        try:
            buf = b""
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                buf += chunk
                if b"\n" in buf or len(buf) > 65536:
                    break
            if not buf:
                conn.close()
                continue
            line = buf.decode("utf-8", errors="replace").split("\n")[0]
            response = handle_request(line) + "\n"
            conn.send(response.encode("utf-8"))
        except Exception as e:
            try:
                conn.send((json.dumps({"ok": False, "message": str(e)}, ensure_ascii=False) + "\n").encode("utf-8"))
            except Exception:
                pass
        finally:
            try:
                conn.close()
            except Exception:
                pass
    server.close()
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    sys.exit(0)


if __name__ == "__main__":
    main()
