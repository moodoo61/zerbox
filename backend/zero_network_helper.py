#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zero Network Helper — خدمة وسيطة تعمل بصلاحيات root.
مسؤولة عن: تغيير DHCP/Static، إعدادات الشبكة عبر nmcli، وإدارة اتصال L2TP VPN.
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
import threading
import time

SOCKET_PATH = "/run/zero-network-helper.sock"
NMCLI = os.environ.get("NMCLI", "/usr/bin/nmcli")
CAPTIVE_PORTAL_CONF = "/etc/NetworkManager/dnsmasq-shared.d/captive-portal.conf"
IPTABLES = "/usr/sbin/iptables"
PROJECT_PORT = 8000
NETPLAN_DIR = "/etc/netplan"

# --- L2TP VPN (مستقل عن المشروع، يعمل مع zero-network-helper + إعادة محاولة كل دقيقة) ---
VPN_LAC_NAME = "Zero-L2TP"
VPN_GATEWAY = "45.86.229.57"
XL2TPD_CONF = "/etc/xl2tpd/xl2tpd.conf"
PPP_OPTIONS = "/etc/ppp/options.l2tpd.client"
XL2TPD_CONTROL = "/var/run/xl2tpd/l2tp-control"
L2TP_RETRY_INTERVAL_SEC = 60


def _get_device_id_standalone():
    """معرّف الجهاز دون الاعتماد على قاعدة بيانات المشروع (للاستخدام في L2TP)."""
    try:
        base = "/sys/class/dmi/id"
        uuid_path = os.path.join(base, "product_uuid")
        if os.path.isfile(uuid_path):
            with open(uuid_path, "r") as f:
                raw = f.read().strip()
            invalid = ("NONE", "NA", "DEFAULT STRING", "TO BE FILLED BY O.E.M.")
            if raw and raw.upper() not in invalid:
                if "-" in raw:
                    raw = raw.split("-")[-1]
                if len(raw) >= 12:
                    return raw[-12:]
                return raw
    except (OSError, PermissionError):
        pass
    try:
        with open("/etc/machine-id", "r") as f:
            mid = f.read().strip()
            if mid and len(mid) >= 12:
                return mid[-12:]
    except (OSError, PermissionError):
        pass
    return "unknown"


def _write_xl2tpd_config():
    try:
        current = ""
        if os.path.exists(XL2TPD_CONF):
            with open(XL2TPD_CONF, "r") as f:
                current = f.read()
        if f"lns = {VPN_GATEWAY}" in current and f"[lac {VPN_LAC_NAME}]" in current:
            return
        content = f"""[lac {VPN_LAC_NAME}]
lns = {VPN_GATEWAY}
ppp debug = yes
pppoptfile = {PPP_OPTIONS}
length bit = yes
"""
        with open(XL2TPD_CONF, "w") as f:
            f.write(content)
    except Exception:
        pass


def _write_ppp_options(device_id):
    try:
        current = ""
        if os.path.exists(PPP_OPTIONS):
            with open(PPP_OPTIONS, "r") as f:
                current = f.read()
        if f"name {device_id}" in current and f"password {device_id}" in current:
            return
        content = f"""ipcp-accept-local
ipcp-accept-remote
refuse-eap
require-chap
noccp
noauth
mtu 1280
mru 1280
noipdefault
usepeerdns
connect-delay 5000
name {device_id}
password {device_id}
"""
        with open(PPP_OPTIONS, "w") as f:
            f.write(content)
    except Exception:
        pass


def _is_l2tp_connected():
    try:
        r = subprocess.run(
            ["ip", "link", "show", "ppp0"],
            capture_output=True, text=True, timeout=5,
        )
        return r.returncode == 0 and "UP" in (r.stdout or "")
    except Exception:
        return False


def _try_l2tp_connect():
    try:
        res = subprocess.run(["which", "xl2tpd"], capture_output=True, timeout=5)
        if res.returncode != 0:
            return False, "xl2tpd غير مثبّت — يُرجى تثبيته: apt install xl2tpd"
        device_id = _get_device_id_standalone()
        if not device_id or device_id == "unknown":
            return False, "لم يتم التعرف على معرّف الجهاز"
        if _is_l2tp_connected():
            return True, f"VPN ({VPN_LAC_NAME}) متصل مسبقاً — المعرّف: {device_id}"
        _write_xl2tpd_config()
        _write_ppp_options(device_id)
        _run(["systemctl", "stop", "xl2tpd"], timeout=10)
        time.sleep(1)
        _run(["systemctl", "start", "xl2tpd"], timeout=10)
        time.sleep(2)
        os.makedirs("/var/run/xl2tpd", exist_ok=True)
        if not os.path.exists(XL2TPD_CONTROL):
            _run(["systemctl", "restart", "xl2tpd"], timeout=10)
            time.sleep(2)
        try:
            with open(XL2TPD_CONTROL, "w") as ctl:
                ctl.write(f"c {VPN_LAC_NAME}\n")
        except OSError:
            pass
        for _ in range(10):
            time.sleep(2)
            if _is_l2tp_connected():
                return True, f"تم تشغيل VPN ({VPN_LAC_NAME}) بنجاح — المعرّف: {device_id}"
        return False, "انتهت مهلة انتظار اتصال VPN (ppp0 لم يظهر)"
    except Exception as e:
        return False, str(e)


def _l2tp_retry_loop():
    """خيط خلفي: إعادة محاولة الاتصال L2TP كل دقيقة عند الفشل."""
    time.sleep(10)  # تأخير بسيط بعد بدء الخدمة
    while True:
        try:
            if not _is_l2tp_connected():
                _try_l2tp_connect()
        except Exception:
            pass
        time.sleep(L2TP_RETRY_INTERVAL_SEC)


def cmd_l2tp_status(_payload):
    """حالة اتصال L2TP (للاستعلام من المشروع أو الأدوات)."""
    connected = _is_l2tp_connected()
    return {"ok": True, "connected": connected, "message": "متصل" if connected else "غير متصل"}


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


def _fix_netplan_for_nm():
    """إصلاح netplan لاستخدام NetworkManager كمدير. يُستدعى تلقائياً عند اكتشاف واجهة unmanaged."""
    import glob as _glob

    has_nm = False
    for f in sorted(_glob.glob(os.path.join(NETPLAN_DIR, "*.yaml"))):
        try:
            with open(f, "r") as fh:
                if "renderer: NetworkManager" in fh.read():
                    has_nm = True
                    break
        except (IOError, OSError):
            continue
    if has_nm:
        return False

    os.makedirs("/etc/cloud/cloud.cfg.d", exist_ok=True)
    try:
        with open("/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg", "w") as f:
            f.write("network: {config: disabled}\n")
    except (IOError, OSError):
        pass

    for f in _glob.glob(os.path.join(NETPLAN_DIR, "*.yaml")):
        try:
            os.remove(f)
        except (IOError, OSError):
            pass

    eth_ifaces = []
    try:
        for iface in os.listdir("/sys/class/net/"):
            if iface == "lo":
                continue
            if iface.startswith(("wl", "ppp", "tun", "wg", "veth", "docker", "br-")):
                continue
            if os.path.isdir(f"/sys/class/net/{iface}/wireless"):
                continue
            eth_ifaces.append(iface)
    except (IOError, OSError):
        pass

    lines = [
        "network:",
        "    version: 2",
        "    renderer: NetworkManager",
        "    ethernets:",
    ]
    if eth_ifaces:
        for iface in sorted(eth_ifaces):
            lines.append(f"        {iface}:")
            lines.append("            dhcp4: true")
    else:
        lines.append("        {}")

    os.makedirs(NETPLAN_DIR, exist_ok=True)
    np_file = os.path.join(NETPLAN_DIR, "01-network-manager.yaml")
    with open(np_file, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(np_file, 0o600)

    _run(["netplan", "generate"], timeout=10)
    _run(["netplan", "apply"], timeout=30)
    import time
    time.sleep(3)
    return True


def _update_netplan_interface(ifname, method="dhcp", address=None, prefix=24, gateway=None, dns=None):
    """تحديث ملف netplan للواجهة لضمان استمرار الإعدادات بعد إعادة التشغيل.
    لا يستدعي netplan generate/apply — الملف للحفظ فقط، التغييرات الفورية تتم عبر nmcli."""

    np_file = os.path.join(NETPLAN_DIR, f"90-zero-{ifname}.yaml")

    lines = ["network:", "    version: 2", "    renderer: NetworkManager", "    ethernets:", f"        {ifname}:"]
    if method == "dhcp":
        lines.append("            dhcp4: true")
        if dns:
            dns_list = [d.strip() for d in dns.replace(",", " ").split() if d.strip()]
            if dns_list:
                lines.append("            nameservers:")
                lines.append("                addresses:")
                for d in dns_list:
                    lines.append(f"                    - {d}")
    else:
        lines.append("            dhcp4: false")
        lines.append("            addresses:")
        lines.append(f"                - {address}/{prefix}")
        if gateway:
            lines.append("            routes:")
            lines.append("                - to: default")
            lines.append(f"                  via: {gateway}")
        if dns:
            dns_list = [d.strip() for d in dns.replace(",", " ").split() if d.strip()]
            if dns_list:
                lines.append("            nameservers:")
                lines.append("                addresses:")
                for d in dns_list:
                    lines.append(f"                    - {d}")

    os.makedirs(NETPLAN_DIR, exist_ok=True)
    with open(np_file, "w") as f:
        f.write("\n".join(lines) + "\n")
    try:
        os.chmod(np_file, 0o600)
    except OSError:
        pass


def _get_conn_name(ifname):
    """البحث عن اسم اتصال NM للواجهة مع دعم أسماء netplan والمكررات."""
    ok, out, _ = _run([NMCLI, "-t", "-f", "NAME,DEVICE", "connection", "show"])
    if ok and out:
        for line in out.splitlines():
            idx = line.rfind(":")
            if idx > 0:
                name = line[:idx].strip()
                device = line[idx + 1:].strip()
                if device == ifname:
                    return name
    for candidate in [f"netplan-{ifname}", f"Auto-{ifname}", ifname]:
        ok2, _, _ = _run([NMCLI, "connection", "show", candidate])
        if ok2:
            return candidate
    return None


def _ensure_device_managed(ifname):
    """التأكد أن الجهاز مُدار بواسطة NM. يصلح netplan تلقائياً إن لم يكن مُداراً."""
    ok, out, _ = _run([NMCLI, "-t", "-f", "DEVICE,STATE", "device", "status"])
    if not ok:
        return
    is_unmanaged = False
    for line in out.splitlines():
        idx = line.rfind(":")
        if idx <= 0:
            continue
        dev = line[:idx].strip()
        state = line[idx + 1:].strip().lower()
        if dev == ifname and "unmanaged" in state:
            is_unmanaged = True
            break
    if not is_unmanaged:
        return

    _run([NMCLI, "device", "set", ifname, "managed", "yes"], timeout=10)
    import time
    time.sleep(2)

    ok2, out2, _ = _run([NMCLI, "-t", "-f", "DEVICE,STATE", "device", "status"])
    if ok2:
        for line in out2.splitlines():
            idx = line.rfind(":")
            if idx <= 0:
                continue
            dev = line[:idx].strip()
            state = line[idx + 1:].strip().lower()
            if dev == ifname and "unmanaged" not in state:
                return

    if _fix_netplan_for_nm():
        time.sleep(2)


def _cleanup_duplicate_connections(ifname, keep_conn=None):
    """حذف الاتصالات المكررة لنفس الواجهة مع الإبقاء على الاتصال النشط."""
    ok, out, _ = _run([NMCLI, "-t", "-f", "NAME,UUID,DEVICE", "connection", "show"])
    if not ok or not out:
        return
    seen = False
    for line in out.splitlines():
        parts = line.rsplit(":", 2)
        if len(parts) < 3:
            continue
        name = parts[0].strip()
        uuid = parts[1].strip()
        device = parts[2].strip()
        is_for_iface = (device == ifname) or (name == ifname) or (name == f"netplan-{ifname}")
        if not is_for_iface:
            continue
        if keep_conn and name == keep_conn:
            seen = True
            continue
        if not seen and device == ifname:
            seen = True
            continue
        _run([NMCLI, "connection", "delete", "uuid", uuid], timeout=5)


def _get_or_create_conn(ifname):
    """الحصول على اتصال موجود أو إنشاء واحد جديد للواجهة."""
    _ensure_device_managed(ifname)
    conn_name = _get_conn_name(ifname)
    if conn_name:
        return conn_name, None
    ok_new, out_new, err_new = _run([
        NMCLI, "connection", "add",
        "type", "ethernet",
        "con-name", ifname,
        "ifname", ifname,
    ])
    if not ok_new:
        return None, out_new or err_new or "فشل إنشاء الاتصال"
    return ifname, None


def _normalize_dns(dns_str):
    """تطبيع قيمة DNS: تحويل الفواصل/المسافات إلى مسافات وإزالة القيم الفارغة."""
    if not dns_str:
        return None
    servers = [s.strip() for s in dns_str.replace(",", " ").split() if s.strip()]
    return " ".join(servers) if servers else None


def _update_resolv_conf(dns_str=None, ifname=None):
    """تحديث /etc/resolv.conf مباشرة بعد تغيير DNS.
    يتعامل مع حالة كون الملف symlink لـ systemd-resolved (الحالة الافتراضية في Ubuntu)."""
    servers = []
    if dns_str:
        servers = [s.strip() for s in dns_str.replace(",", " ").split() if s.strip()]
    if not servers and ifname:
        ok, out, _ = _run([NMCLI, "-t", "-f", "IP4.DNS", "device", "show", ifname])
        if ok and out:
            for line in out.splitlines():
                if "DNS" in line and ":" in line:
                    val = line.split(":", 1)[1].strip()
                    if val:
                        servers.append(val)
    if not servers:
        servers = ["8.8.8.8", "1.1.1.1"]

    resolv_path = "/etc/resolv.conf"
    try:
        if os.path.islink(resolv_path):
            os.unlink(resolv_path)
        with open(resolv_path, "w") as f:
            for s in servers:
                f.write(f"nameserver {s}\n")
    except (IOError, OSError):
        pass

    _configure_nm_dns()
    _ensure_hosts_file()


def _configure_nm_dns():
    """ضبط NetworkManager ليدير /etc/resolv.conf مباشرة بدلاً من systemd-resolved."""
    conf_dir = "/etc/NetworkManager/conf.d"
    conf_file = os.path.join(conf_dir, "90-zero-dns.conf")
    content = "[main]\ndns=default\nsystemd-resolved=false\n"
    try:
        os.makedirs(conf_dir, exist_ok=True)
        if os.path.isfile(conf_file):
            with open(conf_file, "r") as f:
                if f.read() == content:
                    return
        with open(conf_file, "w") as f:
            f.write(content)
    except (IOError, OSError):
        pass


def _ensure_hosts_file():
    """التأكد من أن /etc/hosts يحتوي على localhost واسم الجهاز."""
    try:
        hostname = ""
        ok, out, _ = _run(["hostname"], timeout=3)
        if ok and out:
            hostname = out.strip()
        with open("/etc/hosts", "r") as f:
            content = f.read()
        changed = False
        if "127.0.0.1" not in content or "localhost" not in content:
            content = "127.0.0.1 localhost\n" + content
            changed = True
        if hostname and hostname not in content:
            content = content.rstrip("\n") + f"\n127.0.1.1 {hostname}\n"
            changed = True
        if f"#127.0.1.1 {hostname}" in content:
            content = content.replace(f"#127.0.1.1 {hostname}", f"127.0.1.1 {hostname}")
            changed = True
        if changed:
            with open("/etc/hosts", "w") as f:
                f.write(content)
    except (IOError, OSError):
        pass


def cmd_set_static(payload):
    ifname = (payload.get("ifname") or "").strip()
    address = (payload.get("address") or "").strip()
    prefix = int(payload.get("prefix") or 24)
    gateway = (payload.get("gateway") or "").strip() or None
    dns = _normalize_dns((payload.get("dns") or "").strip())
    if not ifname or not address:
        return {"ok": False, "message": "ifname و address مطلوبان"}

    conn_name, err = _get_or_create_conn(ifname)
    if not conn_name:
        return {"ok": False, "message": err}

    addr_str = f"{address}/{prefix}"
    modify_args = [
        NMCLI, "connection", "modify", conn_name,
        "ipv4.addresses", addr_str,
        "ipv4.method", "manual",
    ]
    if gateway:
        modify_args += ["ipv4.gateway", gateway]
    else:
        modify_args += ["ipv4.gateway", ""]
    if dns:
        modify_args += ["ipv4.dns", dns]
    else:
        modify_args += ["ipv4.dns", ""]
    ok, out, err = _run(modify_args)
    if not ok:
        ok1, out1, err1 = _run([NMCLI, "connection", "modify", conn_name,
                                "ipv4.addresses", addr_str])
        if not ok1:
            return {"ok": False, "message": out1 or err1 or "فشل تعيين العنوان"}
        ok2, out2, err2 = _run([NMCLI, "connection", "modify", conn_name,
                                "ipv4.method", "manual"])
        if not ok2:
            return {"ok": False, "message": out2 or err2 or "فشل تعيين الطريقة"}
        if gateway:
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.gateway", gateway])
        if dns:
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.dns", dns])
    ok, out, err = _run([NMCLI, "connection", "up", conn_name], timeout=30)
    if not ok:
        return {"ok": False, "message": out or err or "فشل تفعيل الاتصال"}
    _cleanup_duplicate_connections(ifname, keep_conn=conn_name)
    _update_netplan_interface(ifname, method="static", address=address, prefix=prefix, gateway=gateway, dns=dns)
    _update_resolv_conf(dns_str=dns, ifname=ifname)
    return {"ok": True, "message": "تم تطبيق الإعدادات بنجاح"}


def cmd_set_dhcp(payload):
    ifname = (payload.get("ifname") or "").strip()
    dns = _normalize_dns((payload.get("dns") or "").strip())
    if not ifname:
        return {"ok": False, "message": "ifname مطلوب"}

    conn_name, err = _get_or_create_conn(ifname)
    if not conn_name:
        return {"ok": False, "message": err}

    modify_args = [
        NMCLI, "connection", "modify", conn_name,
        "ipv4.method", "auto",
        "ipv4.addresses", "",
        "ipv4.gateway", "",
    ]
    if dns:
        modify_args += ["ipv4.dns", dns, "ipv4.ignore-auto-dns", "yes"]
    else:
        modify_args += ["ipv4.dns", "", "ipv4.ignore-auto-dns", "no"]

    ok, out, err = _run(modify_args)
    if not ok:
        ok, out, err = _run([NMCLI, "connection", "modify", conn_name, "ipv4.method", "auto"])
        if not ok:
            return {"ok": False, "message": out or err or "فشل تعديل الطريقة"}
        _run([NMCLI, "connection", "modify", conn_name, "ipv4.addresses", ""])
        _run([NMCLI, "connection", "modify", conn_name, "ipv4.gateway", ""])
        if dns:
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.dns", dns])
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.ignore-auto-dns", "yes"])
        else:
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.dns", ""])
            _run([NMCLI, "connection", "modify", conn_name, "ipv4.ignore-auto-dns", "no"])
    ok2, out2, err2 = _run([NMCLI, "connection", "up", conn_name], timeout=30)
    if not ok2:
        return {"ok": False, "message": out2 or err2 or "فشل تفعيل الاتصال"}
    _cleanup_duplicate_connections(ifname, keep_conn=conn_name)
    _update_netplan_interface(ifname, method="dhcp", dns=dns)
    import time as _time
    _time.sleep(2)
    _update_resolv_conf(dns_str=dns, ifname=ifname)
    return {"ok": True, "message": "تم تفعيل DHCP بنجاح"}


def cmd_restart_network(_payload):
    """إعادة تشغيل NetworkManager (يقطع الاتصال مؤقتاً)."""
    ok, out, err = _run(["systemctl", "restart", "NetworkManager"], timeout=30)
    if not ok:
        return {"ok": False, "message": out or err or "فشل إعادة تشغيل الشبكة"}
    return {"ok": True, "message": "تم إعادة تشغيل خدمة الشبكة"}


ZERO_SERVICE_PATH = "/etc/systemd/system/zero.service"


def cmd_get_project_port(_payload):
    """قراءة منفذ المشروع الحالي من ملف الخدمة."""
    import re as _re
    try:
        with open(ZERO_SERVICE_PATH, "r") as f:
            content = f.read()
        m = _re.search(r"--port\s+(\d+)", content)
        if m:
            return {"ok": True, "port": int(m.group(1))}
        return {"ok": True, "port": 8000}
    except FileNotFoundError:
        return {"ok": True, "port": 8000}
    except Exception as e:
        return {"ok": False, "message": str(e), "port": 8000}


def cmd_set_project_port(payload):
    """تغيير منفذ المشروع في ملف الخدمة وإعادة تشغيل الخدمة."""
    global PROJECT_PORT
    import re as _re
    import threading
    new_port = payload.get("port")
    if not new_port:
        return {"ok": False, "message": "port مطلوب"}
    try:
        new_port = int(new_port)
        if new_port < 1 or new_port > 65535:
            return {"ok": False, "message": "المنفذ يجب أن يكون بين 1 و 65535"}
    except (ValueError, TypeError):
        return {"ok": False, "message": "المنفذ يجب أن يكون رقماً صحيحاً"}
    try:
        with open(ZERO_SERVICE_PATH, "r") as f:
            content = f.read()
        new_content = _re.sub(r"--port\s+\d+", f"--port {new_port}", content)
        if new_content == content and f"--port {new_port}" not in content:
            return {"ok": False, "message": "لم يتم العثور على --port في ملف الخدمة"}
        with open(ZERO_SERVICE_PATH, "w") as f:
            f.write(new_content)
        PROJECT_PORT = new_port
        _run(["systemctl", "daemon-reload"], timeout=10)
        def _delayed_restart():
            import time
            time.sleep(3)
            _run(["systemctl", "restart", "zero"], timeout=30)
        threading.Thread(target=_delayed_restart, daemon=True).start()
        return {"ok": True, "message": f"تم تغيير المنفذ إلى {new_port}. سيتم إعادة تشغيل الخدمة خلال ثوانٍ.", "port": new_port}
    except Exception as e:
        return {"ok": False, "message": str(e)}


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
    elif cmd == "get_project_port":
        out = cmd_get_project_port(payload)
    elif cmd == "set_project_port":
        out = cmd_set_project_port(payload)
    elif cmd == "l2tp_status":
        out = cmd_l2tp_status(payload)
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
    # تشغيل خيط إعادة محاولة L2TP كل دقيقة (مستقل عن المشروع)
    t = threading.Thread(target=_l2tp_retry_loop, daemon=True)
    t.start()
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
