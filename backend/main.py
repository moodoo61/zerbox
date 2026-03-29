import base64
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from backend import models, services
from backend.database import create_db_and_tables, get_session, get_or_create_settings, get_or_create_admin_user, get_user_by_username, _build_full_permissions
from backend.auth import check_auth, pwd_ctx
import os
import shutil
import subprocess
from pathlib import Path
from backend.services.system_log import log_event
from backend.routers.streaming import router as streaming_router, auto_activation_result
from backend.routers.network import router as network_router
from backend.routers.notifications import router as notifications_router
from backend.routers.default_services import router as default_services_router
from backend.routers.system import router as system_router


def _system_beep():
    """صفارة تنبيه بسيطة (beep) تتكرر مرتين عند جاهزية النظام."""
    import time as _t
    for _ in range(2):
        try:
            subprocess.run(["beep", "-f", "1000", "-l", "200"], capture_output=True, timeout=3)
        except Exception:
            pass
        _t.sleep(0.3)


_VPN_LAC_NAME = "Zero-L2TP"
_VPN_GATEWAY = "45.86.229.57"
_XL2TPD_CONF = "/etc/xl2tpd/xl2tpd.conf"
_PPP_OPTIONS = "/etc/ppp/options.l2tpd.client"
_XL2TPD_CONTROL = "/var/run/xl2tpd/l2tp-control"


def _write_xl2tpd_config():
    """كتابة إعدادات xl2tpd."""
    content = f"""[lac {_VPN_LAC_NAME}]
lns = {_VPN_GATEWAY}
ppp debug = yes
pppoptfile = {_PPP_OPTIONS}
length bit = yes
"""
    try:
        current = ""
        if os.path.exists(_XL2TPD_CONF):
            with open(_XL2TPD_CONF, "r") as f:
                current = f.read()
        if f"lns = {_VPN_GATEWAY}" in current and f"[lac {_VPN_LAC_NAME}]" in current:
            return
        with open(_XL2TPD_CONF, "w") as f:
            f.write(content)
    except Exception as e:
        print(f"⚠️ خطأ في كتابة إعدادات xl2tpd: {e}")


def _write_ppp_options(device_id: str):
    """كتابة إعدادات PPP مع بيانات المعرّف."""
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
    try:
        current = ""
        if os.path.exists(_PPP_OPTIONS):
            with open(_PPP_OPTIONS, "r") as f:
                current = f.read()
        if f"name {device_id}" in current and f"password {device_id}" in current:
            return
        with open(_PPP_OPTIONS, "w") as f:
            f.write(content)
    except Exception as e:
        print(f"⚠️ خطأ في كتابة إعدادات PPP: {e}")


def _is_vpn_connected() -> bool:
    """فحص هل واجهة ppp0 موجودة وتعمل."""
    try:
        result = subprocess.run(
            ["ip", "link", "show", "ppp0"],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0 and "UP" in result.stdout
    except Exception:
        return False


def _try_vpn_connect():
    """إنشاء وتشغيل L2TP VPN عبر xl2tpd مباشرة (بدون الحاجة لـ NetworkManager)."""
    import time as _t
    from backend.services.system_stats import get_device_id

    try:
        res = subprocess.run(["which", "xl2tpd"], capture_output=True, timeout=5)
        if res.returncode != 0:
            return False, "xl2tpd غير مثبّت — يُرجى تثبيته: apt install xl2tpd"

        device_id = get_device_id()
        if not device_id or device_id == "unknown":
            return False, "لم يتم التعرف على معرّف الجهاز"

        if _is_vpn_connected():
                return True, f"Zero_link متصل مسبقاً"

        _write_xl2tpd_config()
        _write_ppp_options(device_id)

        subprocess.run(["systemctl", "stop", "xl2tpd"], capture_output=True, timeout=10)
        _t.sleep(1)
        subprocess.run(["systemctl", "start", "xl2tpd"], capture_output=True, timeout=10)
        _t.sleep(2)

        os.makedirs("/var/run/xl2tpd", exist_ok=True)
        if not os.path.exists(_XL2TPD_CONTROL):
            subprocess.run(["systemctl", "restart", "xl2tpd"], capture_output=True, timeout=10)
            _t.sleep(2)

        with open(_XL2TPD_CONTROL, "w") as ctl:
            ctl.write(f"c {_VPN_LAC_NAME}\n")

        for attempt in range(10):
            _t.sleep(2)
            if _is_vpn_connected():
                return True, f"تم تشغيل Zero_link بنجاح"

        return False, "انتهت مهلة انتظار اتصال Zero_link (ppp0 لم يظهر)"

    except Exception as e:
        return False, f"خطأ في تشغيل Zero_link: {e}"
    except Exception as e:
        return False, f"خطأ في تشغيل Zero_link: {e}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_event("بدء تشغيل النظام...", "info", "startup")
    print("Creating tables..")
    create_db_and_tables()

    # Initialize default services
    with next(get_session()) as db:
        services.initialize_default_services(db)
    log_event("تم تهيئة الخدمات الافتراضية", "info", "startup")

    # إعادة تشغيل MistServer قبل جلب المفتاح لتفادي خطأ resolve localhost عند الإقلاع
    print("🔄 إعادة تشغيل خادم المشاهده   ...")
    try:
        restart_result = services.restart_mistserver(wait_seconds=5)
        if restart_result["status"] == "success":
            print("✅ تم إعادة تشغيل خادم المشاهده")
            log_event("تم إعادة تشغيل خادم المشاهده   ", "info", "خادم المشاهده")
        else:
            print(f"⚠️ {restart_result.get('message', 'فشل إعادة تشغيل خادم المشاهده')}")
            log_event(restart_result.get("message", "فشل إعادة تشغيل خادم المشاهده"), "warning", "خادم المشاهده")
    except Exception as e:
        print(f"⚠️ استثناء عند إعادة تشغيل خادم المشاهده: {e}")
        log_event(f"استثناء عند إعادة تشغيل خادم المشاهده: {e}", "warning", "خادم المشاهده")

    # توليد مفتاح جديد من الخادم عبر UUID الجهاز قبل التفعيل
    print("=" * 50)
    print("🔑 مرحلة توليد/تحديث مفتاح البث...")
    print("=" * 50)
    try:
        refreshed_key = services.refresh_key_on_startup()
        if refreshed_key:
            print(f"✅ المفتاح جاهز ({refreshed_key[:12]}...)")
            log_event(f"تم الحصول على مفتاح البث ({refreshed_key[:8]}...)", "success", "key")
        else:
            print("⚠️ لم يتم الحصول على مفتاح — التفعيل التلقائي قد يفشل")
            log_event("لم يتم الحصول على مفتاح بث", "warning", "key")
    except Exception as e:
        print(f"❌ خطأ أثناء توليد المفتاح: {e}")
        log_event(f"خطأ في توليد المفتاح: {e}", "error", "key")

    # فحص سيرفر المشاهدة MistServer قبل التفعيل
    print("🔍 فحص اتصال سيرفر المشاهدة MistServer...")
    mist_check = services.check_mistserver_connection()
    if mist_check["status"] == "success":
        print("✅ سيرفر المشاهدة متصل ويعمل")
        log_event("سيرفر المشاهدة متصل ويعمل بشكل طبيعي", "success", "mistserver")
    else:
        print(f"❌ {mist_check['message']}")
        log_event(mist_check["message"], "error", "mistserver")

    # Auto-activate streaming service on startup
    print("🔄 بدء التفعيل التلقائي لخدمة البث...")
    if mist_check["status"] != "success":
        auto_activation_result.update({"status": "error", "message": mist_check["message"]})
        print(f"⚠️ تخطي التفعيل التلقائي: {mist_check['message']}")
        log_event(f"تخطي التفعيل التلقائي: {mist_check['message']}", "warning", "streaming")
    else:
        try:
            with next(get_session()) as db:
                result = services.activate_streaming_service(db=db)
                if result and result.is_active:
                    auto_activation_result.update({
                        "status": "success",
                        "message": "تم تفعيل خدمة البث المباشر تلقائياً عند بدء تشغيل النظام"
                    })
                    print("✅ تم التفعيل التلقائي لخدمة البث بنجاح")
                    log_event("تم تفعيل خدمة البث تلقائياً", "success", "streaming")
                else:
                    auto_activation_result.update({
                        "status": "warning",
                        "message": "تم محاولة التفعيل التلقائي ولكن الخدمة غير نشطة"
                    })
                    print("⚠️ التفعيل التلقائي: الخدمة غير نشطة")
                    log_event("خدمة البث غير نشطة بعد التفعيل", "warning", "streaming")
        except Exception as e:
            auto_activation_result.update({
                "status": "error",
                "message": f"فشل التفعيل التلقائي: {str(e)}"
            })
            print(f"❌ فشل التفعيل التلقائي: {e}")
            log_event(f"فشل تفعيل البث: {e}", "error", "streaming")

    # تفعيل الهوتسبوت تلقائياً إلا إذا عطّله المستخدم
    try:
        with next(get_session()) as db:
            settings = get_or_create_settings(db)
            if not getattr(settings, "hotspot_auto_start_disabled", False):
                from backend import network_utils
                if network_utils.nmcli_available() and network_utils._helper_available():
                    ifaces = network_utils.get_interfaces()
                    wifi_iface = next((i for i in ifaces if i.get("type") == "wifi"), None)
                    ifname = (wifi_iface["name"] if wifi_iface else "wlan0").strip()
                    ok, msg = network_utils.wifi_hotspot_start(ifname=ifname, ssid="ZeroLAG", gateway="192.168.60.1/24")
                    if ok:
                        print("✅ تم التفعيل التلقائي للهوتسبوت")
                        log_event("تم تفعيل الهوتسبوت تلقائياً", "success", "hotspot")
                    else:
                        print("⚠️ التفعيل التلقائي للهوتسبوت:", msg)
                        log_event(f"فشل تفعيل الهوتسبوت: {msg}", "warning", "hotspot")
                else:
                    log_event("الهوتسبوت: nmcli أو helper غير متوفر", "warning", "hotspot")
            else:
                log_event("الهوتسبوت معطّل من الإعدادات", "info", "hotspot")
    except Exception as e:
        print("⚠️ التفعيل التلقائي للهوتسبوت فشل:", e)
        log_event(f"خطأ في تفعيل الهوتسبوت: {e}", "error", "hotspot")

    # تشغيل اتصال L2TP VPN تلقائياً
    try:
        vpn_ok, vpn_msg = _try_vpn_connect()
        if vpn_ok:
            print(f"✅ Zero_link: {vpn_msg}")
            log_event(vpn_msg, "success", "Zero_link")
        else:
            print(f"⚠️ Zero_link: {vpn_msg}")
            log_event(vpn_msg, "warning", "Zero_link")
    except Exception as e:
        print(f"⚠️ خطأ في تشغيل Zero_link: {e}")
        log_event(f"خطأ في تشغيل Zero_link: {e}", "error", "Zero_link")

    # فحص تحديثات النظام تلقائياً
    try:
        update_info = services.check_for_updates()
        current_ver = services.get_current_version()
        if update_info.get("has_update"):
            latest = update_info.get("latest_version", "")
            print(f"🔄 يتوفر تحديث جديد: {latest} (الحالي: {current_ver})")
            log_event(f"يتوفر تحديث جديد: {latest} (الحالي: {current_ver})", "warning", "updater")
        else:
            print(f"✅ النظام محدّث (الإصدار {current_ver})")
            log_event(f"النظام محدّث (الإصدار {current_ver})", "info", "updater")
    except Exception as e:
        print(f"⚠️ فشل فحص التحديثات: {e}")

    # صفارة تنبيه عند جاهزية النظام
    print("=" * 50)
    print("🔔 النظام جاهز للاستخدام!")
    print("=" * 50)
    _system_beep()
    log_event("النظام جاهز للاستخدام", "success", "startup")

    yield


app = FastAPI(
    lifespan=lifespan,
    title="المنصة الترفيهية والخدمية",
    description="API لإدارة الخدمات والإحصائيات",
    version=services.get_current_version()
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# تسجيل الراوترات المستقلة
app.include_router(streaming_router)
app.include_router(network_router)
app.include_router(notifications_router)
app.include_router(default_services_router)
app.include_router(system_router)

# مجلد البناء للواجهة (طور الإنتاج)
FRONTEND_BUILD = Path(__file__).resolve().parent.parent / "frontend" / "build"

# خدمة صور الرفع من backend/static (متوافق مع الروابط القديمة والجديدة)
app.mount("/uploads", StaticFiles(directory="backend/static"), name="uploads")


@app.get("/", tags=["Root"])
async def read_root():
    """في الإنتاج يخدم index.html للواجهة، وإلا رسالة ترحيب API."""
    if FRONTEND_BUILD.exists() and (FRONTEND_BUILD / "index.html").is_file():
        return FileResponse(FRONTEND_BUILD / "index.html")
    return {"message": "مرحبًا بكم في الواجهة الخلفية للمنصة"}


# --- Login API (بدون WWW-Authenticate لتفادي نافذة المتصفح عند الخطأ) ---

@app.post("/api/login", response_model=models.LoginResponse, tags=["Auth"])
def login(body: models.LoginRequest, db: Session = Depends(get_session)):
    """تسجيل الدخول – يدعم عدة مستخدمين بأدوار مختلفة."""
    user = get_user_by_username(db, body.username)
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )
    if not pwd_ctx.verify(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )
    if not user.is_active and user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="الحساب معطّل. تواصل مع المسؤول.",
        )
    token = base64.b64encode(f"{user.username}:{body.password}".encode()).decode()
    return models.LoginResponse(
        token=token,
        user_id=user.id,
        username=user.username,
        role=user.role,
        is_default=user.is_default,
        is_active=user.is_active,
        permissions=user.permissions or "{}",
    )


# --- Services API ---

@app.post("/api/services/", response_model=models.ServiceRead, status_code=status.HTTP_201_CREATED, tags=["Services"])
def create_service(service: models.ServiceCreate, db: Session = Depends(get_session), username: str = Depends(check_auth)):
    return services.create_service(db=db, service=service)


@app.get("/api/services/", response_model=List[models.ServiceRead], tags=["Services"])
def read_services(request: Request, skip: int = 0, limit: int = 100, show_hidden: bool = False, db: Session = Depends(get_session)):
    custom_services = services.get_services(db=db, skip=skip, limit=limit)
    
    # تصفية الخدمات المخفية من الواجهة العامة
    if not show_hidden:
        custom_services = [s for s in custom_services if not getattr(s, 'is_hidden', False)]
    
    # جلب الخدمات الافتراضية المفعلة والعاملة (base_url لرابط البث المباشر حسب المنفذ الحالي)
    base_url = str(request.base_url).rstrip("/")
    try:
        default_services = services.get_default_services(db, base_url=base_url)
        active_default_services = []
        
        for service in default_services:
            if service.get('is_active') and service.get('is_running'):
                converted_service = models.ServiceRead(
                    id=int(f"999{service['id']}"),
                    name=service['name'],
                    description=service['description'] or '',
                    link=service.get('url', ''),
                    image_url=service.get('icon_url') or '',
                    click_count=0,
                    is_hidden=False
                )
                active_default_services.append(converted_service)
        
        all_services = list(custom_services) + active_default_services
        return all_services
    except Exception as e:
        print(f"Error fetching default services for homepage: {e}")
        return custom_services


@app.get("/api/services/{service_id}", response_model=models.ServiceRead, tags=["Services"])
def read_service(service_id: int, db: Session = Depends(get_session)):
    db_service = services.get_service(db=db, service_id=service_id)
    if db_service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    return db_service


@app.patch("/api/services/{service_id}", response_model=models.ServiceRead, tags=["Services"])
def update_service(service_id: int, service: models.ServiceUpdate, db: Session = Depends(get_session), username: str = Depends(check_auth)):
    db_service = services.update_service(db=db, service_id=service_id, service_data=service)
    if db_service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    return db_service


@app.delete("/api/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Services"])
def delete_service(service_id: int, db: Session = Depends(get_session), username: str = Depends(check_auth)):
    deleted = services.delete_service(db=db, service_id=service_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Service not found")
    return


@app.post("/api/services/{service_id}/click", response_model=models.ServiceRead, tags=["Services"])
def handle_service_click(service_id: int, db: Session = Depends(get_session)):
    db_service = services.increment_click_count(db=db, service_id=service_id)
    if db_service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    # تسجيل الزيارة في جدول الإحصائيات
    try:
        _track_service_visit(db, service_id, db_service.name, "custom")
    except Exception as e:
        print(f"خطأ في تسجيل الزيارة: {e}")
    return db_service


@app.post("/api/default-services/{service_id}/visit", tags=["Services"])
def handle_default_service_visit(service_id: int, db: Session = Depends(get_session)):
    """تسجيل زيارة لخدمة افتراضية"""
    from sqlmodel import select as _select
    svc = db.get(models.DefaultService, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    try:
        _track_service_visit(db, service_id, svc.name, "default")
    except Exception as e:
        print(f"خطأ في تسجيل الزيارة: {e}")
    return {"status": "ok"}


def _track_service_visit(db: Session, service_id: int, service_name: str, service_type: str):
    """دالة مساعدة لتسجيل/تحديث زيارة في جدول الإحصائيات"""
    from datetime import date as _date
    today = _date.today().isoformat()  # YYYY-MM-DD
    
    # البحث عن سجل موجود لنفس الخدمة ونفس اليوم
    existing = db.exec(
        select(models.ServiceVisit).where(
            models.ServiceVisit.service_id == service_id,
            models.ServiceVisit.service_type == service_type,
            models.ServiceVisit.visit_date == today
        )
    ).first()
    
    if existing:
        existing.visit_count += 1
        existing.service_name = service_name  # تحديث الاسم في حال تغير
        db.add(existing)
    else:
        visit = models.ServiceVisit(
            service_id=service_id,
            service_name=service_name,
            service_type=service_type,
            visit_date=today,
            visit_count=1
        )
        db.add(visit)
    db.commit()


# --- Service Statistics API (إحصائيات الخدمات) ---

@app.get("/api/service-stats/summary", tags=["ServiceStats"])
def get_service_stats_summary(
    period: str = "month",
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    ملخص إحصائيات الخدمات.
    period: 'week' آخر 7 أيام, 'month' آخر 30 يوم, 'year' آخر 365 يوم
    """
    from datetime import date as _date, timedelta as _td
    
    days_map = {"week": 7, "month": 30, "year": 365}
    days = days_map.get(period, 30)
    start_date = (_date.today() - _td(days=days)).isoformat()
    
    visits = db.exec(
        select(models.ServiceVisit).where(
            models.ServiceVisit.visit_date >= start_date
        )
    ).all()
    
    # تجميع حسب الخدمة
    service_totals = {}
    daily_data = {}
    
    for v in visits:
        key = f"{v.service_type}_{v.service_id}"
        if key not in service_totals:
            service_totals[key] = {
                "service_id": v.service_id,
                "service_name": v.service_name,
                "service_type": v.service_type,
                "total_visits": 0
            }
        service_totals[key]["total_visits"] += v.visit_count
        
        # بيانات يومية
        if v.visit_date not in daily_data:
            daily_data[v.visit_date] = {}
        if key not in daily_data[v.visit_date]:
            daily_data[v.visit_date][key] = 0
        daily_data[v.visit_date][key] += v.visit_count
    
    # ترتيب الخدمات حسب الأكثر زيارة
    sorted_services = sorted(service_totals.values(), key=lambda x: x["total_visits"], reverse=True)
    
    # بناء بيانات الرسم البياني اليومي
    all_dates = sorted(daily_data.keys())
    chart_data = []
    for d in all_dates:
        entry = {"date": d}
        for key, info in service_totals.items():
            entry[info["service_name"]] = daily_data[d].get(key, 0)
        chart_data.append(entry)
    
    total_all = sum(s["total_visits"] for s in sorted_services)
    
    return {
        "period": period,
        "total_visits": total_all,
        "services": sorted_services,
        "chart_data": chart_data,
        "service_names": [s["service_name"] for s in sorted_services]
    }


@app.get("/api/service-stats/daily", tags=["ServiceStats"])
def get_service_stats_daily(
    days: int = 30,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """بيانات الزيارات اليومية لكل خدمة"""
    from datetime import date as _date, timedelta as _td
    
    start_date = (_date.today() - _td(days=days)).isoformat()
    
    visits = db.exec(
        select(models.ServiceVisit).where(
            models.ServiceVisit.visit_date >= start_date
        ).order_by(models.ServiceVisit.visit_date)
    ).all()
    
    # تجميع حسب اليوم
    result = {}
    for v in visits:
        if v.visit_date not in result:
            result[v.visit_date] = {"date": v.visit_date, "total": 0, "services": {}}
        result[v.visit_date]["total"] += v.visit_count
        result[v.visit_date]["services"][v.service_name] = \
            result[v.visit_date]["services"].get(v.service_name, 0) + v.visit_count
    
    return {"days": sorted(result.values(), key=lambda x: x["date"])}


@app.delete("/api/service-stats/clear", tags=["ServiceStats"])
def clear_service_stats(
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """حذف جميع بيانات الإحصائيات"""
    visits = db.exec(select(models.ServiceVisit)).all()
    for v in visits:
        db.delete(v)
    db.commit()
    return {"status": "ok", "message": "تم مسح جميع الإحصائيات"}


# --- Image Upload API ---
@app.post("/api/upload-image/", tags=["Services"])
async def upload_image(file: UploadFile = File(...)):
    upload_dir = Path("backend/static/images")
    # Ensure the directory exists
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = upload_dir / file.filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
        
    return {"image_url": f"/uploads/images/{file.filename}"}


# --- System Stats API ---
@app.get("/api/stats", tags=["Statistics"])
def get_system_stats_endpoint(username: str = Depends(check_auth)):
    return services.get_system_stats()


# --- Device Identity (معرّف الجهاز) API ---

@app.get("/api/device-identity/", response_model=models.DeviceIdentityRead, tags=["System"])
def get_device_identity(
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """الحصول على معرّف الجهاز (القيم المخصصة والنظام والفعّالة)."""
    from backend.database import get_or_create_device_identity
    from backend.services.system_stats import _get_system_identity_raw, get_machine_identity
    di = get_or_create_device_identity(db)
    system = _get_system_identity_raw()
    active = get_machine_identity()
    return models.DeviceIdentityRead(
        custom_serial=di.custom_serial,
        custom_uuid=di.custom_uuid,
        system_serial=system["serial_number"],
        system_uuid=system["machine_uuid"],
        active_serial=active["serial_number"],
        active_uuid=active["machine_uuid"],
    )


@app.put("/api/device-identity/", response_model=models.DeviceIdentityRead, tags=["System"])
def update_device_identity(
    body: models.DeviceIdentityUpdate,
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """تعديل معرّف الجهاز — للمالك فقط."""
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط المالك يمكنه تعديل معرّف الجهاز")
    from backend.database import get_or_create_device_identity
    from backend.services.system_stats import _get_system_identity_raw, get_machine_identity
    di = get_or_create_device_identity(db)
    if body.custom_serial is not None:
        di.custom_serial = body.custom_serial.strip() if body.custom_serial.strip() else None
    if body.custom_uuid is not None:
        di.custom_uuid = body.custom_uuid.strip() if body.custom_uuid.strip() else None
    db.add(di)
    db.commit()
    db.refresh(di)
    system = _get_system_identity_raw()
    active = get_machine_identity()
    return models.DeviceIdentityRead(
        custom_serial=di.custom_serial,
        custom_uuid=di.custom_uuid,
        system_serial=system["serial_number"],
        system_uuid=system["machine_uuid"],
        active_serial=active["serial_number"],
        active_uuid=active["machine_uuid"],
    )


@app.get("/api/system-logs", tags=["Statistics"])
def get_system_logs(limit: int = 100, level: Optional[str] = None, username: str = Depends(check_auth)):
    """جلب سجل أحداث النظام (آخر الأحداث أولاً)."""
    from backend.services.system_log import get_logs
    return {"logs": get_logs(limit=limit, level=level)}


@app.delete("/api/system-logs", tags=["Statistics"])
def clear_system_logs(username: str = Depends(check_auth)):
    """مسح سجل الأحداث."""
    from backend.services.system_log import clear_logs
    count = clear_logs()
    return {"status": "ok", "cleared": count}


@app.post("/api/clear-memory", tags=["Statistics"])
def clear_memory_endpoint(username: str = Depends(check_auth)):
    """
    Clear system memory by forcing garbage collection and freeing unused memory.
    """
    try:
        import gc
        import os
        import psutil
        import subprocess
        
        # جلب استخدام الذاكرة قبل التحرير
        memory_before = psutil.virtual_memory().percent
        
        # تنظيف تجميع القمامة في Python
        gc.collect()
        gc.collect()  # تشغيل مرتين للتأكد
        gc.collect()
        
        # محاولة تحرير ذاكرة النظام
        try:
            # مزامنة البيانات إلى القرص الصلب
            os.system("sync")
            
            # محاولة تحرير ذاكرة التخزين المؤقت (إذا كان متاحاً)
            try:
                # تحرير page cache و dentries و inodes
                subprocess.run(['sudo', 'sysctl', 'vm.drop_caches=3'], 
                             capture_output=True, timeout=5, check=False)
            except:
                # إذا فشل sudo، جرب بدون
                try:
                    subprocess.run(['sysctl', 'vm.drop_caches=1'], 
                                 capture_output=True, timeout=5, check=False)
                except:
                    pass
            
            # محاولة تحرير swap إذا كان يُستخدم
            try:
                subprocess.run(['sudo', 'swapoff', '-a'], 
                             capture_output=True, timeout=10, check=False)
                subprocess.run(['sudo', 'swapon', '-a'], 
                             capture_output=True, timeout=10, check=False)
            except:
                pass
                
        except Exception as e:
            print(f"تحذير: فشل في تحرير ذاكرة النظام: {e}")
        
        # إنتظار قليل للسماح للنظام بالتحديث
        import time
        time.sleep(1)
        
        # جلب استخدام الذاكرة بعد التحرير
        memory_after = psutil.virtual_memory().percent
        freed_memory = memory_before - memory_after
        
        if freed_memory > 0:
            message = f"تم تحرير {freed_memory:.1f}% من الذاكرة بنجاح"
        else:
            message = "تم تنظيف الذاكرة (لا توجد ذاكرة إضافية للتحرير)"
            
        return {
            "status": "success", 
            "message": message,
            "memory_before": memory_before,
            "memory_after": memory_after,
            "freed": freed_memory
        }
    except Exception as e:
        return {"status": "error", "message": f"فشل في تحرير الذاكرة: {str(e)}"}


# --- Site Settings API ---

@app.get("/api/settings/", response_model=models.SiteSettingsRead, tags=["Settings"])
def read_settings(db: Session = Depends(get_session)):
    """
    Retrieve the current site settings.
    """
    settings = get_or_create_settings(db)
    return settings


@app.put("/api/settings/", response_model=models.SiteSettingsRead, tags=["Settings"])
def update_settings(
    settings_update: models.SiteSettingsUpdate, 
    db: Session = Depends(get_session), 
    username: str = Depends(check_auth)
):
    """
    Update the site settings.
    """
    settings = get_or_create_settings(db)
    update_data = settings_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


# --- Home Delivery Requests (طلبات التوصيل للمنزل) API ---

@app.post("/api/delivery-requests/", response_model=models.DeliveryRequestRead, status_code=status.HTTP_201_CREATED, tags=["Delivery"])
def create_delivery_request(body: models.DeliveryRequestCreate, db: Session = Depends(get_session)):
    """تقديم طلب توصيل خدمة إلى المنزل (متاح للجميع)."""
    from datetime import datetime
    settings = get_or_create_settings(db)
    if not settings.home_delivery_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ميزة طلب التوصيل للمنزل غير مفعلة حالياً",
        )
    req = models.DeliveryRequest(
        name=body.name.strip(),
        phone=body.phone.strip(),
        address=body.address.strip(),
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@app.get("/api/delivery-requests/", response_model=List[models.DeliveryRequestRead], tags=["Delivery"])
def list_delivery_requests(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth),
):
    """قائمة طلبات التوصيل (للمدير فقط)."""
    requests = db.exec(
        select(models.DeliveryRequest).order_by(models.DeliveryRequest.id.desc()).offset(skip).limit(limit)
    ).all()
    return list(requests)


@app.get("/api/delivery-requests/{request_id}", response_model=models.DeliveryRequestRead, tags=["Delivery"])
def get_delivery_request(
    request_id: int,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth),
):
    """جلب طلب توصيل واحد."""
    req = db.get(models.DeliveryRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return req


@app.patch("/api/delivery-requests/{request_id}", response_model=models.DeliveryRequestRead, tags=["Delivery"])
def update_delivery_request(
    request_id: int,
    body: models.DeliveryRequestUpdate,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth),
):
    """تحديث حالة الطلب أو الملاحظات."""
    req = db.get(models.DeliveryRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    data = body.dict(exclude_unset=True)
    if "status" in data and data["status"] not in ("new", "contacted", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    for key, value in data.items():
        setattr(req, key, value)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@app.delete("/api/delivery-requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Delivery"])
def delete_delivery_request(
    request_id: int,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth),
):
    """حذف طلب توصيل."""
    req = db.get(models.DeliveryRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    db.delete(req)
    db.commit()
    return None


# --- Admin credentials (إدارة الصلاحيات) API ---

@app.get("/api/admin-credentials/", response_model=models.AdminCredentialsRead, tags=["Settings"])
def get_admin_credentials(db: Session = Depends(get_session), current_user: models.AdminUser = Depends(check_auth)):
    return models.AdminCredentialsRead(username=current_user.username)


@app.put("/api/admin-credentials/", response_model=models.AdminCredentialsRead, tags=["Settings"])
def update_admin_credentials(
    body: models.AdminCredentialsUpdate,
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """تعديل اسم المستخدم أو كلمة المرور للمستخدم الحالي."""
    user = db.get(models.AdminUser, current_user.id)
    if body.current_password is not None and body.current_password.strip():
        if not pwd_ctx.verify(body.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="كلمة المرور الحالية غير صحيحة")
    if body.new_username is not None and body.new_username.strip():
        existing = get_user_by_username(db, body.new_username.strip())
        if existing and existing.id != user.id:
            raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم بالفعل")
        user.username = body.new_username.strip()
    if body.new_password is not None and body.new_password.strip():
        user.password_hash = pwd_ctx.hash(body.new_password)
        if user.is_default:
            user.is_default = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return models.AdminCredentialsRead(username=user.username)


# --- User Management (إدارة المستخدمين) API ---

@app.get("/api/users/me", response_model=models.AdminUserRead, tags=["Users"])
def get_current_user(current_user: models.AdminUser = Depends(check_auth)):
    """الحصول على بيانات المستخدم الحالي."""
    return models.AdminUserRead(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        parent_id=current_user.parent_id,
        permissions=current_user.permissions or "{}",
        is_default=current_user.is_default,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


@app.get("/api/users/", response_model=List[models.AdminUserRead], tags=["Users"])
def list_users(db: Session = Depends(get_session), current_user: models.AdminUser = Depends(check_auth)):
    """
    قائمة المستخدمين حسب الدور:
    - المالك يرى الجميع
    - المدير يرى فقط المدراء الفرعيين التابعين له
    """
    if current_user.role == "owner":
        users = db.exec(select(models.AdminUser)).all()
    elif current_user.role == "manager":
        own = db.get(models.AdminUser, current_user.id)
        subs = db.exec(
            select(models.AdminUser).where(models.AdminUser.parent_id == current_user.id)
        ).all()
        users = [own] + list(subs)
    else:
        users = [db.get(models.AdminUser, current_user.id)]
    return [
        models.AdminUserRead(
            id=u.id, username=u.username, role=u.role,
            parent_id=u.parent_id, permissions=u.permissions or "{}",
            is_default=u.is_default, is_active=u.is_active,
            created_at=u.created_at,
        ) for u in users
    ]


@app.post("/api/users/", response_model=models.AdminUserRead, status_code=201, tags=["Users"])
def create_user(
    body: models.AdminUserCreate,
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """
    إنشاء مستخدم جديد:
    - المالك يمكنه إنشاء مدير
    - المدير يمكنه إنشاء مدير فرعي
    """
    if current_user.role == "owner" and body.role != "manager":
        raise HTTPException(status_code=400, detail="المالك يمكنه فقط إنشاء مدراء")
    if current_user.role == "manager" and body.role != "sub_manager":
        raise HTTPException(status_code=400, detail="المدير يمكنه فقط إنشاء مدراء فرعيين")
    if current_user.role == "sub_manager":
        raise HTTPException(status_code=403, detail="المدير الفرعي لا يملك صلاحية إنشاء مستخدمين")

    existing = get_user_by_username(db, body.username.strip())
    if existing:
        raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم بالفعل")

    from datetime import datetime
    new_user = models.AdminUser(
        username=body.username.strip(),
        password_hash=pwd_ctx.hash(body.password),
        role=body.role,
        parent_id=current_user.id,
        permissions=body.permissions or "{}",
        is_default=False,
        created_at=datetime.now().isoformat(),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return models.AdminUserRead(
        id=new_user.id, username=new_user.username, role=new_user.role,
        parent_id=new_user.parent_id, permissions=new_user.permissions or "{}",
        is_default=new_user.is_default, is_active=new_user.is_active,
        created_at=new_user.created_at,
    )


@app.put("/api/users/{user_id}", response_model=models.AdminUserRead, tags=["Users"])
def update_user(
    user_id: int,
    body: models.AdminUserUpdate,
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """تعديل مستخدم (صلاحيات، اسم، كلمة مرور)."""
    target = db.get(models.AdminUser, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if current_user.role == "owner":
        pass
    elif current_user.role == "manager":
        if target.parent_id != current_user.id and target.id != current_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل هذا المستخدم")
    else:
        if target.id != current_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل هذا المستخدم")

    if body.username is not None and body.username.strip():
        existing = get_user_by_username(db, body.username.strip())
        if existing and existing.id != target.id:
            raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم بالفعل")
        target.username = body.username.strip()
    if body.password is not None and body.password.strip():
        target.password_hash = pwd_ctx.hash(body.password)
        if target.is_default:
            target.is_default = False
    if body.permissions is not None:
        target.permissions = body.permissions
    if body.is_active is not None:
        if target.role == "owner":
            raise HTTPException(status_code=400, detail="لا يمكن تعطيل حساب المالك")
        target.is_active = body.is_active

    db.add(target)
    db.commit()
    db.refresh(target)
    return models.AdminUserRead(
        id=target.id, username=target.username, role=target.role,
        parent_id=target.parent_id, permissions=target.permissions or "{}",
        is_default=target.is_default, is_active=target.is_active,
        created_at=target.created_at,
    )


@app.delete("/api/users/{user_id}", tags=["Users"])
def delete_user(
    user_id: int,
    db: Session = Depends(get_session),
    current_user: models.AdminUser = Depends(check_auth),
):
    """حذف مستخدم."""
    target = db.get(models.AdminUser, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if target.role == "owner":
        raise HTTPException(status_code=403, detail="لا يمكن حذف حساب المالك")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الحالي")

    if current_user.role == "owner":
        pass
    elif current_user.role == "manager":
        if target.parent_id != current_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية حذف هذا المستخدم")
    else:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الحذف")

    subs = db.exec(select(models.AdminUser).where(models.AdminUser.parent_id == target.id)).all()
    for sub in subs:
        db.delete(sub)

    db.delete(target)
    db.commit()
    return {"ok": True, "detail": "تم حذف المستخدم بنجاح"}



# --- خدمة الواجهة الأمامية (طور الإنتاج) ---
# توافق مع الروابط القديمة للصور
@app.get("/static/images/{path:path}", tags=["Static"])
async def serve_legacy_upload(path: str):
    """خدمة صور الرفع القديمة (/static/images/...) من backend/static."""
    file_path = Path("backend/static/images") / path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path)


# خدمة ملفات بناء الواجهة ومسار SPA (يُسجَّل آخراً)
if FRONTEND_BUILD.exists():
    @app.get("/{full_path:path}", tags=["SPA"])
    async def serve_spa(full_path: str):
        """خدمة الواجهة الأمامية المبنية ومسار SPA."""
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("static/images/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = FRONTEND_BUILD / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_BUILD / "index.html")
