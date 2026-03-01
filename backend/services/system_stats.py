"""إحصائيات النظام (CPU, Memory, Disk, Network, VPN)."""
import os
import psutil
import time


def _read_sys_file(path: str, default: str = "—") -> str:
    """قراءة قيمة من ملف في /sys مع التعامل مع الأخطاء."""
    try:
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                value = f.read().strip()
            return value if value and value != "None" else default
    except (OSError, PermissionError):
        pass
    return default


def _shorten_uuid(uuid_str: str) -> str:
    """إرجاع الجزء الأخير من UUID فقط (مثل 94c691aa358c)."""
    if not uuid_str or uuid_str == "—":
        return "—"
    s = uuid_str.strip()
    if "-" in s:
        return s.split("-")[-1]
    if len(s) >= 12:
        return s[-12:]
    return s


def get_machine_identity() -> dict:
    """
    الحصول على الرقم التسلسلي و UUID للجهاز من DMI (Linux).
    يعيد: serial_number, machine_uuid (الجزء الأخير من UUID فقط)
    """
    base = "/sys/class/dmi/id"
    serial = _read_sys_file(os.path.join(base, "product_serial"))
    uuid_full = _read_sys_file(os.path.join(base, "product_uuid"))
    _invalid = ("NONE", "NA", "DEFAULT STRING", "TO BE FILLED BY O.E.M.")
    if serial.upper() in _invalid:
        serial = "—"
    if uuid_full.upper() in _invalid:
        uuid_full = "—"
    machine_uuid = _shorten_uuid(uuid_full) if uuid_full != "—" else "—"
    return {"serial_number": serial, "machine_uuid": machine_uuid}


def get_device_id() -> str:
    """
    الدالة الموحّدة لمعرّف الجهاز — تُرجع الجزء الأخير من UUID البوردة (12 حرف).
    يُستخدم في: توليد المفتاح، اتصال L2TP، عرض لوحة التحكم.
    """
    identity = get_machine_identity()
    device_id = identity.get("machine_uuid", "—")
    if device_id and device_id != "—":
        return device_id
    try:
        with open("/etc/machine-id", "r") as f:
            mid = f.read().strip()
            if mid:
                return mid[-12:] if len(mid) >= 12 else mid
    except Exception:
        pass
    return "unknown"


def get_system_stats():
    boot_time_timestamp = psutil.boot_time()
    uptime_seconds = time.time() - boot_time_timestamp

    if_stats = psutil.net_if_stats()
    net_before = psutil.net_io_counters(pernic=True)
    cpu_usage = psutil.cpu_percent(interval=1)
    net_after = psutil.net_io_counters(pernic=True)

    network_interfaces = {}
    vpn_connected = False
    for name, after in net_after.items():
        if name == "lo":
            continue
        stat = if_stats.get(name)
        if not stat or not stat.isup:
            continue
        name_lower = name.lower()
        if name_lower.startswith("ppp") or name_lower.startswith("tun") or name_lower.startswith("wg") or name_lower.startswith("wireguard"):
            vpn_connected = True
            continue
        before = net_before.get(name)
        if before is None:
            continue
        network_interfaces[name] = {
            "sent_bps": max(0, after.bytes_sent - before.bytes_sent),
            "recv_bps": max(0, after.bytes_recv - before.bytes_recv),
        }
    if not vpn_connected and any(n.lower().startswith("ppp") for n in if_stats):
        vpn_connected = any(if_stats.get(n) and if_stats.get(n).isup for n in if_stats if n.lower().startswith("ppp"))

    identity = get_machine_identity()

    return {
        "cpu_usage": cpu_usage,
        "memory_usage": psutil.virtual_memory().percent,
        "disk_usage": psutil.disk_usage('/').percent,
        "uptime_seconds": uptime_seconds,
        "network_interfaces": network_interfaces,
        "vpn_connected": vpn_connected,
        "serial_number": identity["serial_number"],
        "machine_uuid": identity["machine_uuid"],
    }
