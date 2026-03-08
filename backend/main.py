import base64
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select, SQLModel
from backend import models, services
from backend.database import create_db_and_tables, get_session, get_or_create_settings, get_or_create_admin_user, get_user_by_username, _build_full_permissions
from backend.auth import check_auth, pwd_ctx
import os
import shutil
import subprocess
from pathlib import Path
from backend.services.system_log import log_event


# Store auto-activation result for frontend display
auto_activation_result = {"status": None, "message": None}


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
            return True, f"VPN ({_VPN_LAC_NAME}) متصل مسبقاً — المعرّف: {device_id}"

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
                return True, f"تم تشغيل VPN ({_VPN_LAC_NAME}) بنجاح — المعرّف: {device_id}"

        return False, "انتهت مهلة انتظار اتصال VPN (ppp0 لم يظهر)"

    except Exception as e:
        return False, f"خطأ في تشغيل VPN: {e}"
    except Exception as e:
        return False, f"خطأ في تشغيل VPN: {e}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global auto_activation_result
    log_event("بدء تشغيل النظام...", "info", "startup")
    print("Creating tables..")
    create_db_and_tables()

    # Initialize default services
    with next(get_session()) as db:
        services.initialize_default_services(db)
    log_event("تم تهيئة الخدمات الافتراضية", "info", "startup")

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
        auto_activation_result = {
            "status": "error",
            "message": mist_check["message"]
        }
        print(f"⚠️ تخطي التفعيل التلقائي: {mist_check['message']}")
        log_event(f"تخطي التفعيل التلقائي: {mist_check['message']}", "warning", "streaming")
    else:
        try:
            with next(get_session()) as db:
                result = services.activate_streaming_service(db=db)
                if result and result.is_active:
                    auto_activation_result = {
                        "status": "success",
                        "message": "تم تفعيل خدمة البث المباشر تلقائياً عند بدء تشغيل النظام"
                    }
                    print("✅ تم التفعيل التلقائي لخدمة البث بنجاح")
                    log_event("تم تفعيل خدمة البث تلقائياً", "success", "streaming")
                else:
                    auto_activation_result = {
                        "status": "warning",
                        "message": "تم محاولة التفعيل التلقائي ولكن الخدمة غير نشطة"
                    }
                    print("⚠️ التفعيل التلقائي: الخدمة غير نشطة")
                    log_event("خدمة البث غير نشطة بعد التفعيل", "warning", "streaming")
        except Exception as e:
            auto_activation_result = {
                "status": "error",
                "message": f"فشل التفعيل التلقائي: {str(e)}"
            }
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
            print(f"✅ VPN: {vpn_msg}")
            log_event(vpn_msg, "success", "vpn")
        else:
            print(f"⚠️ VPN: {vpn_msg}")
            log_event(vpn_msg, "warning", "vpn")
    except Exception as e:
        print(f"⚠️ خطأ في تشغيل VPN: {e}")
        log_event(f"خطأ في تشغيل VPN: {e}", "error", "vpn")

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


# --- Network (الشبكة) API ---

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


@app.get("/api/network/interfaces", tags=["Network"])
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


@app.get("/api/network/interface/{ifname}", tags=["Network"])
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


@app.put("/api/network/interface/{ifname}", tags=["Network"])
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
        ok, msg = network_utils.set_connection_dhcp(ifname)
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
    return {"status": "ok", "message": msg}


@app.get("/api/network/wifi-hotspot", tags=["Network"])
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


@app.get("/api/network/wifi-hotspot/clients", tags=["Network"])
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


@app.post("/api/network/wifi-hotspot/start", tags=["Network"])
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
    # تسجيل أن المستخدم فعّل الهوتسبوت → التشغيل التلقائي مفعّل عند الإقلاع
    with next(get_session()) as db:
        settings = get_or_create_settings(db)
        settings.hotspot_auto_start_disabled = False
        db.add(settings)
        db.commit()
    return {"status": "ok", "message": msg}


@app.post("/api/network/wifi-hotspot/stop", tags=["Network"])
def stop_wifi_hotspot(username: str = Depends(check_auth)):
    """إيقاف الهوتسبوت ZeroLAG وحفظ تعطيل التشغيل التلقائي عند الإقلاع."""
    from backend import network_utils
    if not network_utils.nmcli_available():
        raise HTTPException(status_code=501, detail="NetworkManager غير متوفر")
    ok, msg = network_utils.wifi_hotspot_stop()
    # تسجيل أن المستخدم أوقف الهوتسبوت → عدم تفعيله تلقائياً عند الإقلاع
    with next(get_session()) as db:
        settings = get_or_create_settings(db)
        settings.hotspot_auto_start_disabled = True
        db.add(settings)
        db.commit()
    return {"status": "ok", "message": msg}


@app.get("/api/network/project-port", tags=["Network"])
def get_project_port(username: str = Depends(check_auth)):
    """قراءة منفذ المشروع الحالي."""
    from backend import network_utils
    port = network_utils.get_project_port()
    return {"port": port}


@app.put("/api/network/project-port", tags=["Network"])
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


# --- Captive Portal Detection ---

@app.get("/generate_204", include_in_schema=False)
@app.get("/gen_204", include_in_schema=False)
async def captive_portal_android():
    """Android captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@app.get("/hotspot-detect.html", include_in_schema=False)
@app.get("/library/test/success.html", include_in_schema=False)
async def captive_portal_apple():
    """Apple captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@app.get("/connecttest.txt", include_in_schema=False)
@app.get("/redirect", include_in_schema=False)
async def captive_portal_windows():
    """Windows captive portal check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


@app.get("/ncsi.txt", include_in_schema=False)
async def captive_portal_ncsi():
    """Windows NCSI check — redirect to homepage."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/", status_code=302)


# --- Streaming API ---

@app.get("/api/streaming/status", response_model=models.StreamingSubscriptionRead, tags=["Streaming"])
def get_streaming_status(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """
    Get the current streaming subscription status.
    """
    subscription = services.get_or_create_streaming_subscription(db)
    return subscription


@app.get("/api/streaming/startup-result", tags=["Streaming"])
def get_startup_activation_result():
    """
    Get the result of auto-activation at startup.
    Returns whether streaming was auto-activated successfully when the system started.
    """
    return auto_activation_result


@app.post("/api/streaming/activate", response_model=models.StreamingSubscriptionRead, tags=["Streaming"])
def activate_streaming_service(
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Activate streaming service automatically by reading key from key.json file.
    Verifies key with external server, removes old channels, and adds new channels.
    """
    mist_check = services.check_mistserver_connection()
    if mist_check["status"] != "success":
        log_event(f"فشل التفعيل: {mist_check['message']}", "error", "streaming")
        raise HTTPException(status_code=503, detail=mist_check["message"])
    return services.activate_streaming_service(db=db)


@app.post("/api/streaming/refresh-channels", tags=["Streaming"])
def refresh_streaming_channels(
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Refresh channels from external API.
    1. Verify key
    2. Fetch channels from external API
    3. Store and add them to MistServer (no deletion - only add/update)
    """
    try:
        mist_check = services.check_mistserver_connection()
        if mist_check["status"] != "success":
            return {"status": "error", "message": mist_check["message"]}

        # 1. قراءة المفتاح من key.json
        key = services.read_local_key()
        if not key:
            return {"status": "error", "message": "لم يتم العثور على مفتاح key.json"}
        
        # 2. التحقق من المفتاح وجلب القنوات من API الخارجي
        result = services.verify_key_and_fetch_channels(key)
        
        if result.get("status") != "success":
            return {"status": "error", "message": result.get("message", "فشل في جلب القنوات")}
        
        channels_data = result.get("channels", {})
        
        # 3. تخزين القنوات وإضافتها إلى MistServer
        added_count = 0
        updated_count = 0
        
        for i, (stream_key, channel_info) in enumerate(channels_data.items()):
            try:
                # استخراج بيانات القناة
                if isinstance(channel_info, dict):
                    stream_url = channel_info.get("الرابط", channel_info.get("url", ""))
                    display_name = channel_info.get("display_name", channel_info.get("arabic_name", stream_key))
                else:
                    stream_url = str(channel_info)
                    display_name = stream_key
                
                if not stream_url:
                    continue
                
                # التحقق من وجود القناة في قاعدة البيانات لاستخدام جودتها
                existing_channel = db.exec(
                    select(models.Channel).where(models.Channel.stream_key == stream_key)
                ).first()
                quality = getattr(existing_channel, "video_quality", 2) if existing_channel else 2
                source_url = services.build_source_url_with_quality(stream_url, quality)
                
                # إضافة/تحديث في MistServer مع رابط يحتوي &video=X
                if existing_channel:
                    try:
                        services.delete_mistserver_stream(stream_key)
                    except Exception:
                        pass
                services.create_mistserver_stream(stream_key, source_url)
                
                if existing_channel:
                    # تحديث القناة الموجودة
                    existing_channel.url = stream_url
                    existing_channel.name = display_name
                    existing_channel.video_quality = quality
                    updated_count += 1
                else:
                    # إضافة قناة جديدة (الجودة الافتراضية 2)
                    channel = models.Channel(
                        name=display_name,
                        url=stream_url,
                        category="مباشر",
                        sort_order=i,
                        is_active=True,
                        stream_key=stream_key,
                        video_quality=2
                    )
                    db.add(channel)
                    added_count += 1
                
            except Exception as e:
                print(f"❌ خطأ في معالجة {stream_key}: {e}")
                continue
        
        db.commit()
        
        message = f"تم التحديث: {added_count} قناة جديدة"
        if updated_count > 0:
            message += f", {updated_count} قناة محدثة"
        
        return {
            "status": "success",
            "message": message,
            "added": added_count,
            "updated": updated_count,
            "total": len(channels_data)
        }
        
    except Exception as e:
        return {"status": "error", "message": f"فشل في تحديث القنوات: {str(e)}"}


@app.get("/api/streaming/channels", response_model=List[models.ChannelRead], tags=["Streaming"])
def get_streaming_channels(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_session), 
    username: str = Depends(check_auth)
):
    """
    Get all streaming channels.
    """
    return services.get_streaming_channels(db=db, skip=skip, limit=limit)


@app.post("/api/streaming/sync-channels", tags=["Streaming"])
def sync_channels_from_external_server(
    db: Session = Depends(get_session), 
    username: str = Depends(check_auth)
):
    """
    Sync channels from external streaming server.
    """
    return services.sync_channels_from_external_server(db=db)


@app.get("/api/streaming/check-mistserver", tags=["Streaming"])
def check_mistserver_status(username: str = Depends(check_auth)):
    """Quick check if MistServer is installed and running."""
    return services.check_mistserver_connection()


@app.get("/api/streaming/test-mistserver", tags=["Streaming"])
def test_mistserver_connection(username: str = Depends(check_auth)):
    """
    Test connection to MistServer.
    """
    check_result = services.check_mistserver_connection()
    if check_result["status"] == "success":
        log_event("فحص سيرفر المشاهدة: متصل ويعمل بشكل طبيعي", "success", "mistserver")
        try:
            streams = services.get_mistserver_streams()
            return {"status": "success", "message": "سيرفر المشاهدة متصل ويعمل بشكل طبيعي", "data": streams}
        except Exception:
            return {"status": "success", "message": "سيرفر المشاهدة متصل ويعمل بشكل طبيعي"}
    else:
        log_event(f"فحص سيرفر المشاهدة: {check_result['message']}", "error", "mistserver")
        return {"status": "error", "message": check_result["message"]}


@app.get("/api/streaming/test-active-streams", tags=["Streaming"])
def test_active_streams_api(username: str = Depends(check_auth)):
    """
    Test active_streams API to debug statistics issues.
    """
    try:
        result = services.get_active_streams_stats()
        return {"status": "success", "message": "تم جلب إحصائيات القنوات النشطة", "data": result}
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب إحصائيات القنوات النشطة: {str(e)}"}


@app.delete("/api/streaming/channels/{channel_name}", tags=["Streaming"])
def delete_stream_channel(
    channel_name: str,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Delete a stream channel from MistServer and local database.
    channel_name can be either the display name (Arabic) or stream_key.
    """
    try:
        # البحث عن القناة في قاعدة البيانات
        # يمكن أن يكون channel_name هو الاسم العربي أو stream_key
        channel = db.exec(
            select(models.Channel).where(
                (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
            )
        ).first()
        
        if not channel:
            return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}
        
        # استخدام stream_key للحذف من MistServer
        stream_key = channel.stream_key or channel.name
        
        # Delete from MistServer
        print(f"🗑️ حذف {stream_key} من MistServer...")
        services.delete_mistserver_stream(stream_key)
        
        # Delete from local database
        db.delete(channel)
        db.commit()
        
        return {"status": "success", "message": f"تم حذف القناة {channel.name} بنجاح من النظام و MistServer"}
    except Exception as e:
        return {"status": "error", "message": f"فشل في حذف القناة: {str(e)}"}


@app.post("/api/streaming/channels/{channel_name}/reconnect", tags=["Streaming"])
def reconnect_stream_channel(
    channel_name: str,
    username: str = Depends(check_auth)
):
    """
    Force reconnect/reset a stream channel.
    """
    try:
        services.nuke_mistserver_stream(channel_name)
        return {"status": "success", "message": f"تم إعادة الاتصال للقناة {channel_name} بنجاح"}
    except Exception as e:
        return {"status": "error", "message": f"فشل في إعادة الاتصال: {str(e)}"}


@app.post("/api/streaming/channels/{channel_name}/kick-viewers", tags=["Streaming"])
def kick_all_viewers(
    channel_name: str,
    username: str = Depends(check_auth)
):
    """
    Kick all viewers from a specific stream channel.
    """
    try:
        services.stop_stream_sessions(channel_name)
        return {"status": "success", "message": f"تم إخراج جميع المشاهدين من القناة {channel_name}"}
    except Exception as e:
        return {"status": "error", "message": f"فشل في إخراج المشاهدين: {str(e)}"}


def _apply_channel_quality(db: Session, channel: models.Channel, quality: int) -> None:
    """تحديث جودة قناة واحدة في DB و MistServer (حذف وإعادة إضافة بالرابط الجديد)."""
    if quality not in (1, 2, 3):
        raise ValueError("الجودة يجب أن تكون 1 أو 2 أو 3")
    channel.video_quality = quality
    stream_key = channel.stream_key or channel.name
    source_url = services.build_source_url_with_quality(channel.url, quality)
    services.delete_mistserver_stream(stream_key)
    services.create_mistserver_stream(stream_key, source_url)
    db.add(channel)


@app.patch("/api/streaming/channels/{channel_name}/quality", tags=["Streaming"])
def set_channel_quality(
    channel_name: str,
    body: dict,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Set video quality for a single channel (1=اعلى، 2=متوسطة، 3=منخفضة).
    """
    try:
        quality = body.get("quality")
        if quality is None or quality not in (1, 2, 3):
            return {"status": "error", "message": "يجب تحديد الجودة: 1 أو 2 أو 3"}
        channel = db.exec(
            select(models.Channel).where(
                (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
            )
        ).first()
        if not channel:
            return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}
        _apply_channel_quality(db, channel, quality)
        db.commit()
        return {"status": "success", "message": f"تم ضبط جودة القناة {channel.name} إلى {'اعلى' if quality == 1 else 'متوسطة' if quality == 2 else 'منخفضة'}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/streaming/channels/set-all-quality", tags=["Streaming"])
def set_all_channels_quality(
    body: dict,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Set video quality for all channels (1=اعلى، 2=متوسطة، 3=منخفضة).
    """
    try:
        quality = body.get("quality")
        if quality is None or quality not in (1, 2, 3):
            return {"status": "error", "message": "يجب تحديد الجودة: 1 أو 2 أو 3"}
        channels = db.exec(select(models.Channel)).all()
        if not channels:
            return {"status": "error", "message": "لا توجد قنوات"}
        for ch in channels:
            _apply_channel_quality(db, ch, quality)
        db.commit()
        label = "اعلى" if quality == 1 else "متوسطة" if quality == 2 else "منخفضة"
        return {"status": "success", "message": f"تم ضبط جودة جميع القنوات ({len(channels)}) إلى {label}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/streaming/channels/{channel_name}/stats", tags=["Streaming"])
def get_channel_statistics(
    channel_name: str,
    username: str = Depends(check_auth)
):
    """
    Get viewer statistics for a specific channel.
    """
    try:
        # جلب إحصائيات القناة من active_streams
        stream_result = services.get_single_stream_stats(channel_name)
        active_streams = stream_result.get("active_streams") or {} if stream_result else {}
        
        # جلب تفاصيل المشاهدين من clients API
        clients_result = services.get_stream_clients(channel_name)
        clients_data = clients_result.get("clients") or {} if clients_result else {}
        
        # معالجة بيانات المشاهدين
        viewers = []
        if clients_data.get("data"):
            fields = clients_data.get("fields", [])
            for client_data in clients_data["data"]:
                viewer = {}
                for i, field in enumerate(fields):
                    if i < len(client_data):
                        viewer[field] = client_data[i]
                viewers.append(viewer)
        
        # الحصول على إحصائيات القناة من active_streams
        stream_stats = active_streams.get(channel_name, {})
        total_viewers = stream_stats.get("viewers", len(viewers))
        
        return {
            "status": "success",
            "channel": channel_name,
            "total_viewers": total_viewers,
            "viewers": viewers,
            "stream_stats": stream_stats,
            "timestamp": clients_data.get("time", 0)
        }
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب الإحصائيات: {str(e)}"}


@app.get("/api/streaming/all-stats", tags=["Streaming"])
def get_all_channels_statistics(username: str = Depends(check_auth)):
    """
    Get viewer statistics for all channels.
    """
    try:
        # جلب إحصائيات جميع القنوات النشطة
        active_result = services.get_active_streams_stats()
        active_streams = active_result.get("active_streams") or {} if active_result else {}
        
        # جلب تفاصيل المشاهدين لجميع القنوات
        clients_result = services.get_stream_clients()
        clients_data = clients_result.get("clients") or {} if clients_result else {}
        
        # معالجة بيانات المشاهدين وتجميعها حسب القناة
        viewers_by_stream = {}
        if isinstance(clients_data, dict) and clients_data.get("data"):
            fields = clients_data.get("fields") or []
            for client_data in clients_data["data"]:
                viewer = {}
                for i, field in enumerate(fields):
                    if i < len(client_data):
                        viewer[field] = client_data[i]
                
                stream_name = viewer.get("stream", "unknown")
                if stream_name not in viewers_by_stream:
                    viewers_by_stream[stream_name] = []
                viewers_by_stream[stream_name].append(viewer)
        
        # دمج البيانات: مصدر الحقيقة هو active_streams (حالة القناة وعدد المشاهدين الفعلي)
        # لا نعتمد على clients وحدها لعرض عدد المشاهدين لأنها قد تكون قديمة أو لستريم منتهي
        combined_stats = {}
        if isinstance(active_streams, dict):
            for stream_name, stream_stats in active_streams.items():
                if not isinstance(stream_stats, dict):
                    stream_stats = {}
                combined_stats[stream_name] = {
                    "total_viewers": stream_stats.get("viewers", 0),
                    "viewers": viewers_by_stream.get(stream_name, []),
                    "stream_stats": stream_stats,
                    "timestamp": clients_data.get("time", 0) if isinstance(clients_data, dict) else 0
                }
        
        # قنوات تظهر في clients فقط (ليست في active_streams): نعرض 0 مشاهد وحالة غير متصل
        # حتى لا نعرض عدد مشاهدين قديم مع حالة "غير معروف"
        for stream_name, viewers in viewers_by_stream.items():
            if stream_name not in combined_stats:
                combined_stats[stream_name] = {
                    "total_viewers": 0,
                    "viewers": [],
                    "stream_stats": {"status": "offline", "viewers": 0, "inputs": 0, "outputs": 0},
                    "timestamp": clients_data.get("time", 0) if isinstance(clients_data, dict) else 0
                }
        
        return {
            "status": "success",
            "streams_stats": combined_stats,
            "timestamp": clients_data.get("time", 0) if isinstance(clients_data, dict) else 0
        }
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب الإحصائيات: {str(e)}"}


# --- Viewer Page API ---

@app.get("/api/viewer-page/settings", response_model=models.ViewerPageSettingsRead, tags=["Viewer Page"])
def get_viewer_page_settings(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """
    Get viewer page settings.
    """
    return services.get_or_create_viewer_page_settings(db)


@app.put("/api/viewer-page/settings", response_model=models.ViewerPageSettingsRead, tags=["Viewer Page"])
def update_viewer_page_settings(
    settings_update: models.ViewerPageSettingsUpdate,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Update viewer page settings.
    """
    return services.update_viewer_page_settings(db=db, settings_data=settings_update)


@app.get("/api/viewer-page/data", tags=["Viewer Page"])
def get_viewer_page_data(db: Session = Depends(get_session)):
    """
    Get viewer page data for public access (no auth required).
    """
    return services.get_viewer_page_data(db=db)


@app.get("/api/viewer-page/stats", tags=["Viewer Page"])
def get_viewer_page_stats():
    """
    Get streaming statistics for public viewer page (no auth required).
    """
    try:
        # جلب إحصائيات جميع القنوات النشطة
        active_result = services.get_active_streams_stats()
        active_streams = active_result.get("active_streams") or {} if active_result else {}
        
        # تبسيط البيانات للعرض العام
        simplified_stats = {}
        for stream_name, stream_stats in (active_streams.items() if isinstance(active_streams, dict) else []):
            simplified_stats[stream_name] = {
                "connections": stream_stats.get("viewers", 0),
                "status": "active" if stream_stats.get("viewers", 0) > 0 else "inactive"
            }
        
        return {
            "status": "success",
            "streams_stats": simplified_stats,
            "timestamp": active_result.get("timestamp", 0)
        }
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب الإحصائيات: {str(e)}"}


# --- Matches API (جدول مباريات اليوم) ---

# Cache for matches data (refreshed every hour)
_matches_cache = {"data": None, "last_fetch": 0}

@app.get("/api/matches/today", tags=["Matches"])
def get_today_matches(db: Session = Depends(get_session)):
    """
    Get today's matches. Fetches from external API and caches for 1 hour.
    No auth required - public endpoint for viewer page.
    """
    import time as _time
    import requests as _requests
    from datetime import datetime as _datetime
    
    # وقت السيرفر الحالي بصيغة HH:MM AM/PM
    server_now = _datetime.now()
    server_time = server_now.strftime("%I:%M %p")
    server_time_24 = server_now.strftime("%H:%M")
    
    # التحقق من تفعيل جدول المباريات
    try:
        viewer_settings = services.get_or_create_viewer_page_settings(db)
        if not viewer_settings.show_matches_table:
            return {"status": "disabled", "matches": [], "message": "جدول المباريات معطل", "server_time": server_time, "server_time_24": server_time_24}
    except Exception:
        pass
    
    now = _time.time()
    cache_duration = 3600  # ساعة واحدة
    
    # إذا كان الـ cache صالح، أرجع البيانات المخزنة
    if _matches_cache["data"] is not None and (now - _matches_cache["last_fetch"]) < cache_duration:
        return {"status": "success", "matches": _matches_cache["data"], "cached": True, "server_time": server_time, "server_time_24": server_time_24}
    
    # جلب البيانات من الخادم الخارجي
    try:
        response = _requests.get(
            "http://news.zerolagvpn.com/api/matches/today/",
            timeout=15,
            headers={"Content-Type": "application/json"}
        )
        
        if response.ok:
            data = response.json()
            matches = data.get("matches", [])
            
            # تحديث الـ cache
            _matches_cache["data"] = matches
            _matches_cache["last_fetch"] = now
            
            return {"status": "success", "matches": matches, "cached": False, "server_time": server_time, "server_time_24": server_time_24}
        else:
            if _matches_cache["data"] is not None:
                return {"status": "success", "matches": _matches_cache["data"], "cached": True, "stale": True, "server_time": server_time, "server_time_24": server_time_24}
            return {"status": "error", "matches": [], "message": f"فشل جلب المباريات: {response.status_code}", "server_time": server_time, "server_time_24": server_time_24}
    except Exception as e:
        if _matches_cache["data"] is not None:
            return {"status": "success", "matches": _matches_cache["data"], "cached": True, "stale": True, "server_time": server_time, "server_time_24": server_time_24}
        return {"status": "error", "matches": [], "message": f"فشل الاتصال بخادم المباريات: {str(e)}", "server_time": server_time, "server_time_24": server_time_24}


# --- MistServer Proxy Endpoints ---

@app.get("/mistserver/json_{stream_name}.js", tags=["MistServer Proxy"])
def get_mistserver_stream_json(stream_name: str):
    """
    Proxy endpoint to get stream JSON from MistServer.
    This solves CORS issues when frontend tries to access MistServer directly.
    """
    try:
        import requests
        mistserver_url = f"http://localhost:8080/json_{stream_name}.js"
        response = requests.get(mistserver_url, timeout=10)
        
        if response.ok:
            return response.json()
        else:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from MistServer")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MistServer connection error: {str(e)}")


@app.get("/mistserver/hls/{stream_name}/{file_path:path}", tags=["MistServer Proxy"])
async def proxy_hls_stream(stream_name: str, file_path: str, request: Request):
    """
    Proxy endpoint for HLS streaming files (.m3u8, .ts segments).
    This solves CORS issues when HLS.js tries to load manifests and segments.
    """
    try:
        import requests
        from fastapi.responses import Response
        
        # الحصول على query parameters (مثل tkn)
        query_string = str(request.url.query)
        mistserver_url = f"http://localhost:8080/hls/{stream_name}/{file_path}"
        if query_string:
            mistserver_url += f"?{query_string}"
        
        print(f"🔄 Proxying HLS request: {mistserver_url}")
        
        response = requests.get(mistserver_url, timeout=30, stream=True)
        
        if response.ok:
            # تحديد Content-Type بناءً على نوع الملف
            content_type = response.headers.get('Content-Type', 'application/octet-stream')
            if file_path.endswith('.m3u8'):
                content_type = 'application/vnd.apple.mpegurl'
            elif file_path.endswith('.ts'):
                content_type = 'video/mp2t'
            
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Cache-Control': 'no-cache'
                }
            )
        else:
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"MistServer returned {response.status_code}"
            )
    except requests.exceptions.RequestException as e:
        print(f"❌ MistServer connection error: {e}")
        raise HTTPException(status_code=502, detail=f"Cannot connect to MistServer: {str(e)}")
    except Exception as e:
        print(f"❌ Proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


# --- Notifications API (الإشعارات) ---

@app.post("/api/notifications/", response_model=models.NotificationRead, status_code=status.HTTP_201_CREATED, tags=["Notifications"])
def create_notification_endpoint(
    data: models.NotificationCreate,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """إنشاء إشعار جديد (فوري أو مجدول)"""
    return services.create_notification(db=db, data=data)


@app.get("/api/notifications/", response_model=List[models.NotificationRead], tags=["Notifications"])
def list_notifications(
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """جلب جميع الإشعارات"""
    return services.get_notifications(db=db, skip=skip, limit=limit)


@app.delete("/api/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Notifications"])
def delete_notification_endpoint(
    notification_id: int,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """حذف إشعار"""
    if not services.delete_notification(db=db, nid=notification_id):
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")


@app.get("/api/notifications/public", tags=["Notifications"])
def get_public_notifications_endpoint(limit: int = 10, db: Session = Depends(get_session)):
    """جلب آخر الإشعارات المُرسلة (متاح للعامة)"""
    notifications = services.get_public_notifications(db=db, limit=limit)
    return {"status": "success", "notifications": [
        {"id": n.id, "title": n.title, "body": n.body, "icon_url": n.icon_url,
         "link_url": n.link_url, "sent_at": n.sent_at}
        for n in notifications
    ]}


@app.get("/api/notifications/stats", tags=["Notifications"])
def get_notification_stats(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """إحصائيات الإشعارات"""
    total = len(services.get_notifications(db=db, limit=9999))
    subscribers = services.get_subscribers_count(db=db)
    return {"total_notifications": total, "total_subscribers": subscribers}


@app.post("/api/notifications/send-scheduled", tags=["Notifications"])
def send_scheduled_endpoint(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """إرسال الإشعارات المجدولة التي حان وقتها"""
    return services.send_scheduled_notifications(db=db)


# --- Push Subscription API ---

@app.get("/api/push/vapid-key", tags=["Push"])
def get_vapid_public_key():
    """الحصول على المفتاح العام لـ VAPID"""
    key = services.get_vapid_public_key()
    return {"public_key": key}


@app.post("/api/push/subscribe", tags=["Push"])
def push_subscribe(data: models.PushSubscriptionCreate, db: Session = Depends(get_session)):
    """تسجيل اشتراك في الإشعارات الدفعية"""
    sub = services.subscribe_push(db=db, data=data)
    return {"status": "success", "id": sub.id}


@app.post("/api/push/unsubscribe", tags=["Push"])
def push_unsubscribe(data: dict, db: Session = Depends(get_session)):
    """إلغاء اشتراك الإشعارات الدفعية"""
    endpoint = data.get("endpoint", "")
    if services.unsubscribe_push(db=db, endpoint=endpoint):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="الاشتراك غير موجود")


# --- Default Services API ---

@app.get("/api/default-services/", tags=["Default Services"])
def get_default_services(request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Get all default services."""
    base_url = str(request.base_url).rstrip("/")
    return services.get_default_services(db, base_url=base_url)


@app.get("/api/default-services/{service_id}", tags=["Default Services"])
def get_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Get a specific default service."""
    base_url = str(request.base_url).rstrip("/")
    service = services.get_default_service(db, service_id, base_url=base_url)
    if not service:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return service


@app.patch("/api/default-services/{service_id}", response_model=models.DefaultServiceRead, tags=["Default Services"])
def update_default_service(
    service_id: int,
    service_data: models.DefaultServiceUpdate,
    request: Request,
    db: Session = Depends(get_session),
    auth: str = Depends(check_auth)
):
    """Update a default service."""
    base_url = str(request.base_url).rstrip("/")
    service = services.update_default_service(db, service_id, service_data, base_url=base_url)
    if not service:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return service


@app.post("/api/default-services/{service_id}/toggle", tags=["Default Services"])
def toggle_default_service(service_id: int, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Toggle (activate/deactivate) a default service."""
    result = services.toggle_default_service(db, service_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.post("/api/default-services/{service_id}/start", tags=["Default Services"])
def start_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Start a default service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.start_default_service(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.post("/api/default-services/{service_id}/stop", tags=["Default Services"])
def stop_default_service(service_id: int, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Stop a default service."""
    result = services.stop_default_service(db, service_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.post("/api/default-services/{service_id}/restart", tags=["Default Services"])
def restart_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Restart a default service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.restart_default_service(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/api/default-services/{service_id}/status", tags=["Default Services"])
def check_service_status(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Check the actual status of a service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.check_service_status(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


# --- System Update API (نظام التحديث) ---

@app.get("/api/system/version", tags=["System Update"])
def get_system_version():
    """الحصول على إصدار النظام الحالي."""
    return {"version": services.get_current_version()}


@app.get("/api/system/check-update", tags=["System Update"])
def check_system_update(username: str = Depends(check_auth)):
    """فحص وجود تحديث جديد من GitHub Releases."""
    return services.check_for_updates()


@app.post("/api/system/update", tags=["System Update"])
def start_system_update(username: str = Depends(check_auth)):
    """بدء عملية التحديث (تنزيل + بناء + إعادة تشغيل)."""
    update_info = services.check_for_updates()
    if not update_info.get("has_update"):
        return {"status": "error", "message": "لا يوجد تحديث متاح"}
    target = update_info.get("latest_version", "")
    return services.start_update(target_version=target)


@app.get("/api/system/update-status", tags=["System Update"])
def get_system_update_status(username: str = Depends(check_auth)):
    """الحصول على حالة عملية التحديث الجارية."""
    return services.get_update_status()


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
