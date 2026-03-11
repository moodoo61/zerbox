"""راوتر الشبكة: واجهات الشبكة، الهوتسبوت، منفذ المشروع، Captive Portal."""
import time as _time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel
from backend.database import get_session, get_or_create_settings
from backend.auth import check_auth

router = APIRouter()


# ---- Request Models ----

class NetworkInterfaceUpdateRequest(SQLModel):
    method: str  # "dhcp" | "static"
    address: Optional[str] = None
    prefix: Optional[int] = 24
    gateway: Optional[str] = None
    dns: Optional[str] = None


class WifiHotspotStartRequest(SQLModel):
    ifname: str  # مثال: wlan0
    ssid: Optional[str] = "ZeroLAG"
    gateway: Optional[str] = "192.168.60.1"


class ProjectPortUpdateRequest(SQLModel):
    port: int


# ===================== Network Interfaces =====================

@router.get("/api/network/interfaces", tags=["Network"])
def get_network_interfaces(username: str = Depends(check_auth)):
    """قائمة واجهات الشبكة (إيثرنت / واي فاي) مع العناوين والحالة."""
    from backend import network_utils
    try:
        ifaces = network_utils.get_interfaces()
        nm_available = network_utils.nmcli_available()
        for iface in ifaces:
            if nm_available:
                info = network_utils.get_connection_info(iface["name"])
                iface["method"] = info["method"]
                iface["connection_id"] = info["connection_id"]
                if info["address"]:
                    iface["config_address"] = info["address"]
                    iface["config_prefix"] = info["prefix"]
                iface["config_gateway"] = info["gateway"]
                iface["config_dns"] = info["dns"]
            else:
                iface["method"] = "unknown"
                iface["connection_id"] = None
                iface["config_address"] = None
                iface["config_prefix"] = 24
                iface["config_gateway"] = None
                iface["config_dns"] = None
        helper_available = network_utils._helper_available()
        return {"interfaces": ifaces, "nm_available": nm_available, "helper_available": helper_available}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/network/interface/{ifname}", tags=["Network"])
def get_network_interface_detail(ifname: str, username: str = Depends(check_auth)):
    """تفاصيل وإعدادات واجهة واحدة."""
    from backend import network_utils
    ifaces = network_utils.get_interfaces()
    iface = next((i for i in ifaces if i["name"] == ifname), None)
    if not iface:
        raise HTTPException(status_code=404, detail="الواجهة غير موجودة")
    if network_utils.nmcli_available():
        info = network_utils.get_connection_info(ifname)
        iface["method"] = info["method"]
        iface["connection_id"] = info["connection_id"]
        iface["config_address"] = info["address"]
        iface["config_prefix"] = info["prefix"]
        iface["config_gateway"] = info["gateway"]
        iface["config_dns"] = info["dns"]
    return iface


@router.put("/api/network/interface/{ifname}", tags=["Network"])
def update_network_interface(
    ifname: str,
    body: NetworkInterfaceUpdateRequest,
    username: str = Depends(check_auth),
):
    """تطبيق إعدادات الشبكة (DHCP أو Static) على الواجهة."""
    from backend import network_utils
    if not network_utils.nmcli_available():
        raise HTTPException(status_code=501, detail="إعدادات الشبكة تتطلب NetworkManager (nmcli) ولا يتوفر على هذا النظام.")
    ifaces = network_utils.get_interfaces()
    if not any(i["name"] == ifname for i in ifaces):
        raise HTTPException(status_code=404, detail="الواجهة غير موجودة")
    if body.method == "dhcp":
        ok, msg = network_utils.set_connection_dhcp(
            ifname,
            dns=body.dns.strip() if body.dns else None,
        )
    else:
        if not body.address or not body.address.strip():
            raise HTTPException(status_code=400, detail="العنوان مطلوب في وضع Static")
        ok, msg = network_utils.set_connection_static(
            ifname,
            address=body.address.strip(),
            prefix=body.prefix or 24,
            gateway=body.gateway.strip() if body.gateway else None,
            dns=body.dns.strip() if body.dns else None,
        )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    _time.sleep(1)
    new_ifaces = network_utils.get_interfaces()
    new_iface = next((i for i in new_ifaces if i["name"] == ifname), None)
    new_ip = None
    if new_iface and new_iface.get("ipv4"):
        new_ip = new_iface["ipv4"].split("/")[0]
    new_info = network_utils.get_connection_info(ifname)
    return {
        "status": "ok",
        "message": msg,
        "new_ip": new_ip,
        "new_method": new_info.get("method", body.method),
        "new_dns": new_info.get("dns"),
    }


# ===================== WiFi Hotspot =====================

@router.get("/api/network/wifi-hotspot", tags=["Network"])
def get_wifi_hotspot_status(username: str = Depends(check_auth)):
    """حالة الهوتسبوت مع التفاصيل: SSID، IP، الواجهة، MAC."""
    from backend import network_utils
    if not network_utils.nmcli_available():
        raise HTTPException(status_code=501, detail="NetworkManager غير متوفر")
    result = network_utils.wifi_hotspot_status()
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("message", "خطأ"))
    return {
        "active": result.get("active") is True,
        "message": result.get("message", ""),
        "details": result.get("details", {}),
    }


@router.get("/api/network/wifi-hotspot/clients", tags=["Network"])
def get_wifi_hotspot_clients(username: str = Depends(check_auth)):
    """قائمة الأجهزة المتصلة بالهوتسبوت."""
    from backend import network_utils
    if not network_utils._helper_available():
        raise HTTPException(status_code=503, detail="خدمة zero-network-helper غير مشغّلة")
    result = network_utils.wifi_hotspot_clients()
    return {
        "clients": result.get("clients", []),
        "count": result.get("count", 0),
    }


@router.post("/api/network/wifi-hotspot/start", tags=["Network"])
def start_wifi_hotspot(body: WifiHotspotStartRequest, username: str = Depends(check_auth)):
    """
    تفعيل واي فاي كـ Hotspot:
    - SSID: ZeroLAG (أو المحدد في body)
    - بدون كلمة مرور
    - DHCP من 192.168.60.1، رنج 192.168.60.0/24
    """
    from backend import network_utils
    if not network_utils.nmcli_available():
        raise HTTPException(status_code=501, detail="NetworkManager غير متوفر")
    if not network_utils._helper_available():
        raise HTTPException(status_code=503, detail="خدمة zero-network-helper غير مشغّلة. شغّلها: sudo systemctl start zero-network-helper")
    gateway = (body.gateway or "192.168.60.1").strip()
    if "/" not in gateway:
        gateway = gateway + "/24"
    ok, msg = network_utils.wifi_hotspot_start(
        ifname=body.ifname.strip(),
        ssid=(body.ssid or "ZeroLAG").strip(),
        gateway=gateway,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    with next(get_session()) as db:
        settings = get_or_create_settings(db)
        settings.hotspot_auto_start_disabled = False
        db.add(settings)
        db.commit()
    return {"status": "ok", "message": msg}


@router.post("/api/network/wifi-hotspot/stop", tags=["Network"])
def stop_wifi_hotspot(username: str = Depends(check_auth)):
    """إيقاف الهوتسبوت ZeroLAG وحفظ تعطيل التشغيل التلقائي عند الإقلاع."""
    from backend import network_utils
    if not network_utils.nmcli_available():
        raise HTTPException(status_code=501, detail="NetworkManager غير متوفر")
    ok, msg = network_utils.wifi_hotspot_stop()
    with next(get_session()) as db:
        settings = get_or_create_settings(db)
        settings.hotspot_auto_start_disabled = True
        db.add(settings)
        db.commit()
    return {"status": "ok", "message": msg}


# ===================== Project Port =====================

@router.get("/api/network/project-port", tags=["Network"])
def get_project_port(username: str = Depends(check_auth)):
    """قراءة منفذ المشروع الحالي."""
    from backend import network_utils
    port = network_utils.get_project_port()
    return {"port": port}


@router.put("/api/network/project-port", tags=["Network"])
def update_project_port(
    body: ProjectPortUpdateRequest,
    username: str = Depends(check_auth),
):
    """تغيير منفذ المشروع (يتطلب إعادة تشغيل الخدمة)."""
    from backend import network_utils
    if body.port < 1 or body.port > 65535:
        raise HTTPException(status_code=400, detail="المنفذ يجب أن يكون بين 1 و 65535")
    if not network_utils._helper_available():
        raise HTTPException(status_code=503, detail="خدمة zero-network-helper غير مشغّلة")
    ok, msg = network_utils.set_project_port(body.port)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "port": body.port}


# ===================== Captive Portal Detection =====================

@router.get("/generate_204", include_in_schema=False)
@router.get("/gen_204", include_in_schema=False)
async def captive_portal_android():
    """Android captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@router.get("/hotspot-detect.html", include_in_schema=False)
@router.get("/library/test/success.html", include_in_schema=False)
async def captive_portal_apple():
    """Apple captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@router.get("/connecttest.txt", include_in_schema=False)
@router.get("/redirect", include_in_schema=False)
async def captive_portal_windows():
    """Windows captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@router.get("/ncsi.txt", include_in_schema=False)
async def captive_portal_ncsi():
    """Windows NCSI check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)
