# -*- coding: utf-8 -*-
"""
قراءة وإعداد واجهات الشبكة (منافذ إيثرنت / واي فاي).
القراءة: أوامر ip و nmcli من عملية FastAPI.
التعديل (DHCP/Static): عبر خدمة وسيطة zero-network-helper تعمل بصلاحيات root وتستمع على مقبس Unix.
"""
import subprocess
import re
import json
import socket
import os

# مسار مقبس الخدمة الوسيطة (يجب أن يطابق zero_network_helper.py)
HELPER_SOCKET_PATH = "/run/zero-network-helper.sock"


def _run(cmd, timeout=10):
    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**__import__("os").environ, "LANG": "C"},
        )
        return r.returncode == 0, (r.stdout or "").strip(), (r.stderr or "").strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        return False, "", ""


def get_interfaces():
    """
    إرجاع قائمة واجهات الشبكة مع العناوين والحالة.
    مصدر البيانات: ip link + ip addr
    """
    interfaces = []
    # ip -j link (إذا كان مدعوماً)
    ok, out, _ = _run(["ip", "-j", "link", "show"])
    if ok and out:
        try:
            links = json.loads(out)
            for link in links:
                ifname = link.get("ifname") or link.get("ifindex")
                if not ifname:
                    continue
                # تجاهل lo و واجهات VPN (ppp, tun, wg, ...)
                if ifname == "lo":
                    continue
                _lower = ifname.lower()
                if _lower.startswith("ppp") or _lower.startswith("tun") or _lower.startswith("wg"):
                    continue
                kind = (link.get("link_type") or "ether").lower()
                ifname_lower = (ifname or "").lower()
                is_wifi = (
                    "wireless" in kind
                    or (link.get("flags") and "wireless" in str(link.get("flags")).lower())
                    or ifname_lower.startswith("wl")  # wlan0, wlp58s0, etc.
                )
                state = "up" if (link.get("operstate") or "").lower() == "up" else "down"
                interfaces.append({
                    "name": ifname,
                    "type": "wifi" if is_wifi else "ethernet",
                    "state": state,
                    "mac": (link.get("address") or "").strip() or None,
                })
        except (json.JSONDecodeError, TypeError):
            pass
    if not interfaces:
        # fallback: parse "ip link show"
        ok, out, _ = _run(["ip", "link", "show"])
        if ok and out:
            current = None
            for line in out.splitlines():
                m = re.match(r"^\d+:\s+(\w+):", line)
                if m:
                    if current and current.get("name") != "lo":
                        interfaces.append(current)
                    name = m.group(1)
                    _lower = name.lower()
                    if name == "lo" or _lower.startswith("ppp") or _lower.startswith("tun") or _lower.startswith("wg"):
                        current = None
                        continue
                    current = {
                        "name": name,
                        "type": "wifi" if name.lower().startswith("wl") else "ethernet",
                        "state": "down",
                        "mac": None,
                    }
                    if "state UP" in line or "UP" in line:
                        current["state"] = "up"
                    link_match = re.search(r"link/ether\s+([0-9a-f:]+)", line, re.I)
                    if link_match:
                        current["mac"] = link_match.group(1)
                elif current and "link/ether" in line:
                    link_match = re.search(r"link/ether\s+([0-9a-f:]+)", line, re.I)
                    if link_match:
                        current["mac"] = link_match.group(1)
            if current and current.get("name") != "lo":
                interfaces.append(current)

    # إضافة عناوين IPv4/IPv6 من ip addr
    ok, out, _ = _run(["ip", "-j", "addr", "show"])
    if ok and out:
        try:
            addrs_list = json.loads(out)
            by_if = {a.get("ifname"): a for a in addrs_list if a.get("ifname")}
            for iface in interfaces:
                data = by_if.get(iface["name"])
                if not data:
                    iface["addresses"] = []
                    iface["ipv4"] = None
                    iface["ipv6"] = None
                    continue
                addrs = data.get("addr_info") or []
                ipv4 = None
                ipv6 = None
                for a in addrs:
                    family = a.get("family", "")
                    addr = (a.get("local") or "").strip()
                    prefix = a.get("prefixlen")
                    if not addr:
                        continue
                    if family == "inet":
                        ipv4 = f"{addr}/{prefix}" if prefix is not None else addr
                    elif family == "inet6" and not addr.startswith("fe80"):
                        ipv6 = f"{addr}/{prefix}" if prefix is not None else addr
                iface["addresses"] = addrs
                iface["ipv4"] = ipv4
                iface["ipv6"] = ipv6
        except (json.JSONDecodeError, TypeError):
            for iface in interfaces:
                iface.setdefault("ipv4", None)
                iface.setdefault("ipv6", None)
                iface.setdefault("addresses", [])
    else:
        for iface in interfaces:
            iface.setdefault("ipv4", None)
            iface.setdefault("ipv6", None)
            iface.setdefault("addresses", [])

    # gateway من ip route
    ok, out, _ = _run(["ip", "route", "show", "default"])
    if ok and out:
        m = re.search(r"default\s+via\s+(\S+)", out)
        if m:
            default_gw = m.group(1)
            for line in out.splitlines():
                # ربط البوابة بالواجهة: default via X.X.X.X dev eth0
                dev_m = re.search(r"dev\s+(\S+)", line)
                if dev_m and default_gw in line:
                    dev_name = dev_m.group(1)
                    for iface in interfaces:
                        if iface["name"] == dev_name:
                            iface["gateway"] = default_gw
                            break
                    break
    for iface in interfaces:
        iface.setdefault("gateway", None)

    return interfaces


def get_connection_info(ifname):
    """
    الحصول على إعدادات الاتصال (DHCP/Static) من NetworkManager إن وُجد.
    """
    result = {"method": "unknown", "address": None, "prefix": 24, "gateway": None, "dns": None, "connection_id": None}
    ok, out, _ = _run(["nmcli", "-t", "-f", "NAME,DEVICE,TYPE", "connection", "show", "--active"])
    if not ok:
        return result
    for line in out.splitlines():
        if not line:
            continue
        parts = line.split(":")
        if len(parts) >= 2 and parts[1] == ifname:
            result["connection_id"] = parts[0]
            break
    if not result["connection_id"]:
        ok2, out2, _ = _run(["nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show"])
        if ok2:
            for line in out2.splitlines():
                parts = line.split(":")
                if len(parts) >= 2 and parts[1] == ifname:
                    result["connection_id"] = parts[0]
                    break
    cid = result["connection_id"]
    if not cid:
        return result
    ok, out, _ = _run(["nmcli", "-t", "-f", "ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns", "connection", "show", cid])
    if not ok or not out:
        return result
    for line in out.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        val = (val or "").strip()
        if key == "ipv4.method":
            result["method"] = "dhcp" if val in ("auto", "dhcp") else "static"
        elif key == "ipv4.addresses" and val:
            # قد يكون "x.x.x.x/24" أو قائمة
            part = val.split(",")[0].strip()
            if "/" in part:
                addr, prefix = part.split("/", 1)
                result["address"] = addr.strip()
                try:
                    result["prefix"] = int(prefix.strip())
                except ValueError:
                    result["prefix"] = 24
            else:
                result["address"] = part
        elif key == "ipv4.gateway" and val:
            result["gateway"] = val.strip()
        elif key == "ipv4.dns" and val:
            result["dns"] = val.strip()
    return result


def set_connection_static(ifname, address, prefix=24, gateway=None, dns=None, connection_id=None):
    """
    ضبط الواجهة على عنوان ثابت (Static) عبر الخدمة الوسيطة zero-network-helper.
    الخدمة الوسيطة تعمل بصلاحيات root وتستمع على مقبس Unix.
    """
    return _call_helper("set_static", {
        "ifname": ifname,
        "address": address,
        "prefix": prefix,
        "gateway": gateway,
        "dns": dns,
    })


def set_connection_dhcp(ifname, connection_id=None):
    """تفعيل DHCP للواجهة عبر الخدمة الوسيطة zero-network-helper."""
    return _call_helper("set_dhcp", {"ifname": ifname})


def wifi_hotspot_start(ifname, ssid="ZeroLAG", gateway="192.168.60.1/24"):
    """
    تفعيل واي فاي كـ Hotspot: SSID ZeroLAG، بدون كلمة مرور، DHCP من 192.168.60.1.
    يُرجع (success: bool, message: str).
    """
    return _call_helper("wifi_hotspot_start", {
        "ifname": ifname,
        "ssid": ssid,
        "gateway": gateway if "/" in gateway else gateway + "/24",
    })


def wifi_hotspot_stop():
    """إيقاف الهوتسبوت ZeroLAG-Hotspot. يُرجع (success: bool, message: str)."""
    return _call_helper("wifi_hotspot_stop", {})


def wifi_hotspot_status():
    """
    حالة الهوتسبوت مع التفاصيل.
    يُرجع dict: {ok, active, message, details: {ssid, ifname, ip, gateway, mac, band}}
    """
    if not os.path.exists(HELPER_SOCKET_PATH):
        return {"ok": False, "active": False, "message": "خدمة إعدادات الشبكة غير مشغّلة"}
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(HELPER_SOCKET_PATH)
        msg = json.dumps({"cmd": "wifi_hotspot_status", "payload": {}}, ensure_ascii=False) + "\n"
        s.send(msg.encode("utf-8"))
        buf = b""
        while b"\n" not in buf and len(buf) < 65536:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        s.close()
        line = buf.decode("utf-8", errors="replace").split("\n")[0]
        data = json.loads(line) if line.strip() else {}
        return data
    except (socket.error, OSError, json.JSONDecodeError):
        return {"ok": False, "active": False, "message": "لا يمكن الاتصال بالخدمة الوسيطة"}


def wifi_hotspot_clients():
    """
    جلب قائمة الأجهزة المتصلة بالهوتسبوت.
    يُرجع dict: {ok, clients: [...], count}
    """
    if not os.path.exists(HELPER_SOCKET_PATH):
        return {"ok": False, "clients": [], "count": 0}
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect(HELPER_SOCKET_PATH)
        msg = json.dumps({"cmd": "wifi_hotspot_clients", "payload": {}}, ensure_ascii=False) + "\n"
        s.send(msg.encode("utf-8"))
        buf = b""
        while b"\n" not in buf and len(buf) < 65536:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        s.close()
        line = buf.decode("utf-8", errors="replace").split("\n")[0]
        data = json.loads(line) if line.strip() else {}
        return data
    except (socket.error, OSError, json.JSONDecodeError):
        return {"ok": False, "clients": [], "count": 0}


def nmcli_available():
    """التحقق من توفر nmcli (NetworkManager)."""
    ok, _, _ = _run(["which", "nmcli"])
    return ok


def _helper_available():
    """التحقق من أن خدمة zero-network-helper تعمل (المقبس موجود ومتاح)."""
    if not os.path.exists(HELPER_SOCKET_PATH):
        return False
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect(HELPER_SOCKET_PATH)
        s.close()
        return True
    except (socket.error, OSError):
        return False


def _call_helper(cmd, payload):
    """
    إرسال أمر للخدمة الوسيطة عبر مقبس Unix.
    يُرجع (success: bool, message: str).
    """
    if not os.path.exists(HELPER_SOCKET_PATH):
        return False, "خدمة إعدادات الشبكة غير مشغّلة. يرجى تشغيل: sudo systemctl start zero-network-helper"
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(15)
        s.connect(HELPER_SOCKET_PATH)
        msg = json.dumps({"cmd": cmd, "payload": payload}, ensure_ascii=False) + "\n"
        s.send(msg.encode("utf-8"))
        buf = b""
        while b"\n" not in buf and len(buf) < 65536:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        s.close()
        line = buf.decode("utf-8", errors="replace").split("\n")[0]
        data = json.loads(line) if line.strip() else {}
        ok = data.get("ok") is True
        message = data.get("message") or ("تم بنجاح" if ok else "فشل")
        return ok, message
    except (socket.error, OSError, json.JSONDecodeError) as e:
        return False, "لا يمكن الاتصال بخدمة إعدادات الشبكة. تأكد من تشغيل zero-network-helper: " + str(e)
