"""إدارة الخدمات الافتراضية (القرآن الكريم، قافية، الاستراحة، البث المباشر).

حالة التشغيل الفعلية (is_running) للخدمات التي تُدار عبر systemd تُستنتج من
``systemctl is-active`` وليس من قاعدة البيانات. في DB يُحفظ فقط ما يخص التفعيل/التعطيل
(is_active) وإعدادات صفحة البث؛ لا يُعتمد على is_running/process_id المخزّنين
للخدمات من نوع systemctl.
"""
import time
import subprocess
import os
from typing import List, Optional, Dict, Any
from sqlmodel import Session, select
from .. import models
from ..paths import PROJECT_ROOT
from .viewer import get_or_create_viewer_page_settings


def get_server_ip() -> str:
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "localhost"


def _systemd_unit(service: models.DefaultService) -> Optional[str]:
    """اسم وحدة systemd من أمر مثل ``systemctl start jellyfin``."""
    sc = (service.start_command or "").strip()
    if not sc.startswith("systemctl"):
        return None
    parts = sc.split()
    if len(parts) >= 3 and parts[0] == "systemctl" and parts[1] in (
        "start", "stop", "restart", "enable", "disable",
    ):
        return parts[2]
    return None


def _is_viewer_service(service: models.DefaultService) -> bool:
    return service.name == "البث المباشر" or (service.start_command or "") == "viewer_page_toggle"


def _systemctl_is_active(unit: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True,
            text=True,
            timeout=20,
        )
        return result.returncode == 0 and result.stdout.strip() == "active"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _runtime_is_running(
    service: models.DefaultService,
    db: Session,
    *,
    viewer_is_enabled: Optional[bool] = None,
) -> bool:
    """حالة التشغيل الفعلية: systemd، أو إعدادات البث، أو عملية محفوظة (legacy)."""
    if _is_viewer_service(service):
        if viewer_is_enabled is not None:
            return bool(viewer_is_enabled)
        return bool(get_or_create_viewer_page_settings(db).is_enabled)

    unit = _systemd_unit(service)
    if unit:
        return _systemctl_is_active(unit)

    if service.process_id:
        try:
            import psutil as _psutil
            return _psutil.Process(service.process_id).is_running()
        except Exception:
            return False
    return False


def _clear_systemd_runtime_fields(service: models.DefaultService) -> None:
    """لا نخزّن حالة التشغيل لخدمات systemd في DB."""
    if _systemd_unit(service):
        service.is_running = False
        service.process_id = None


def apply_systemd_state_from_db(db: Session) -> None:
    """بعد الإقلاع: إن كانت الخدمة مفعّلة في DB فعّل الوحدة للإقلاع وشغّلها (يتطابق مع توقع المستخدم)."""
    try:
        for row in db.exec(select(models.DefaultService)).all():
            unit = _systemd_unit(row)
            if not unit or not row.is_active:
                continue
            subprocess.run(
                ["systemctl", "enable", "--now", unit],
                capture_output=True,
                text=True,
                timeout=90,
            )
    except Exception as e:
        print(f"⚠️ apply_systemd_state_from_db: {e}")


def _service_url(
    service: models.DefaultService,
    server_ip: str,
    base_url: Optional[str] = None,
    *,
    is_running: Optional[bool] = None,
) -> Optional[str]:
    running = service.is_running if is_running is None else is_running
    if not running:
        return None
    if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
        if base_url:
            return f"{base_url.rstrip('/')}/mubasher"
        return f"http://{server_ip}:{service.port}/mubasher"
    return f"http://{server_ip}:{service.port}"


def _service_row_to_api_dict(
    s: models.DefaultService,
    db: Session,
    server_ip: str,
    base_url: Optional[str],
    viewer_is_enabled: Optional[bool],
) -> Dict[str, Any]:
    live = _runtime_is_running(s, db, viewer_is_enabled=viewer_is_enabled)
    d = {**s.dict(), "is_running": live, "url": _service_url(s, server_ip, base_url, is_running=live)}
    return d


def initialize_default_services(db: Session):
    try:
        existing_services = db.exec(select(models.DefaultService)).all()
        existing_names = [s.name for s in existing_services]
        root = PROJECT_ROOT
        all_default = [
            {
                "name": "القرآن الكريم",
                "path": os.path.join(root, "quran"),
                "port": 8081,
                "start_command": "systemctl start zero-quran",
                "description": "تطبيق القرآن الكريم مع التلاوة والتفسير",
                "is_active": False,
                "is_running": False,
                "auto_start": False,
            },
            {
                "name": "قافية",
                "path": os.path.join(root, "qafiyah", "apps", "web"),
                "port": 8082,
                "start_command": "systemctl start zero-qafiyah",
                "description": "منصة الشعر العربي والقوافي",
                "is_active": False,
                "is_running": False,
                "auto_start": False,
            },
            {
                "name": "الاستراحة",
                "path": "/usr/lib/jellyfin",
                "port": 8096,
                "start_command": "systemctl start jellyfin",
                "description": "سيرفر الوسائط - مكتبة الأفلام والمسلسلات",
                "is_active": True,
                "is_running": False,
                "process_id": None,
                "auto_start": False,
            },
            {
                "name": "البث المباشر",
                "path": os.path.join(root, "frontend"),
                "port": 3000,
                "start_command": "viewer_page_toggle",
                "description": "صفحة مشاهدة البث المباشر للقنوات",
                "is_active": False,
                "is_running": False,
                "auto_start": False,
            },
        ]
        added = []
        for sd in all_default:
            if sd["name"] not in existing_names:
                db.add(models.DefaultService(**sd))
                added.append(sd["name"])
        if added:
            db.commit()
            print(f"✅ تم إضافة الخدمات الافتراضية: {', '.join(added)}")

        # ترحيل: القرآن وقافية كوحدات systemd + إزالة حالة تشغيل خاطئة من DB
        migrated = False
        for row in db.exec(select(models.DefaultService)).all():
            if row.name == "القرآن الكريم" and not (row.start_command or "").startswith("systemctl"):
                row.start_command = "systemctl start zero-quran"
                _clear_systemd_runtime_fields(row)
                db.add(row)
                migrated = True
            elif row.name == "قافية" and not (row.start_command or "").startswith("systemctl"):
                row.start_command = "systemctl start zero-qafiyah"
                _clear_systemd_runtime_fields(row)
                db.add(row)
                migrated = True
            elif _systemd_unit(row) and (row.is_running or row.process_id):
                _clear_systemd_runtime_fields(row)
                db.add(row)
                migrated = True
        if migrated:
            db.commit()

        try:
            viewer_service = db.exec(
                select(models.DefaultService).where(models.DefaultService.name == "البث المباشر")
            ).first()
            if viewer_service:
                viewer_settings = get_or_create_viewer_page_settings(db)
                viewer_service.is_active = viewer_settings.is_enabled
                viewer_service.is_running = viewer_settings.is_enabled
                viewer_service.process_id = None
                db.add(viewer_service)
                db.commit()
        except Exception as sync_error:
            print(f"⚠️ تحذير: فشل في مزامنة خدمة البث المباشر: {sync_error}")
        if not added and not migrated:
            print(f"✅ توجد {len(existing_services)} خدمة افتراضية")
    except Exception as e:
        print(f"❌ خطأ في إنشاء الخدمات الافتراضية: {e}")


def get_default_services(db: Session, skip: int = 0, limit: int = 100, base_url: Optional[str] = None) -> List[Dict[str, Any]]:
    statement = select(models.DefaultService).offset(skip).limit(limit)
    services = db.exec(statement).all()
    server_ip = get_server_ip()
    viewer_settings = get_or_create_viewer_page_settings(db)
    ve = viewer_settings.is_enabled
    return [
        _service_row_to_api_dict(s, db, server_ip, base_url, ve if _is_viewer_service(s) else None)
        for s in services
    ]


def get_default_service(db: Session, service_id: int, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return None
    server_ip = get_server_ip()
    viewer_settings = get_or_create_viewer_page_settings(db)
    ve = viewer_settings.is_enabled
    return _service_row_to_api_dict(
        service, db, server_ip, base_url, ve if _is_viewer_service(service) else None
    )


def update_default_service(db: Session, service_id: int, service_data: models.DefaultServiceUpdate, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    db_service = db.get(models.DefaultService, service_id)
    if db_service:
        for key, value in service_data.dict(exclude_unset=True).items():
            setattr(db_service, key, value)
        db.add(db_service)
        db.commit()
        db.refresh(db_service)
        server_ip = get_server_ip()
        viewer_settings = get_or_create_viewer_page_settings(db)
        ve = viewer_settings.is_enabled
        return _service_row_to_api_dict(
            db_service, db, server_ip, base_url, ve if _is_viewer_service(db_service) else None
        )
    return None


def start_default_service(db: Session, service_id: int, base_url: Optional[str] = None) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    if not service.is_active:
        return {"status": "error", "message": "الخدمة غير مفعلة"}
    if _runtime_is_running(service, db):
        return {"status": "warning", "message": "الخدمة تعمل بالفعل"}
    try:
        server_ip = get_server_ip()
        if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
            viewer_settings = get_or_create_viewer_page_settings(db)
            viewer_settings.is_enabled = True
            db.add(viewer_settings)
            db.commit()
            service.is_running = True
            service.process_id = None
            db.add(service)
            db.commit()
            db.refresh(service)
            viewer_url = _service_url(service, server_ip, base_url, is_running=True)
            return {"status": "success", "message": f"تم تشغيل {service.name} بنجاح", "url": viewer_url, "process_id": None}
        elif service.start_command.startswith("systemctl"):
            service_name = service.start_command.split()[-1]
            # enable + start: يبقى التشغيل بعد إعادة التشغيل (لا يكفي systemctl start وحده)
            result = subprocess.run(
                ["systemctl", "enable", "--now", service_name],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if result.returncode == 0:
                _clear_systemd_runtime_fields(service)
                db.add(service)
                db.commit()
                db.refresh(service)
                live = _runtime_is_running(service, db)
                return {
                    "status": "success",
                    "message": f"تم تشغيل {service.name} بنجاح",
                    "url": f"http://{server_ip}:{service.port}" if live else None,
                    "process_id": None,
                }
            return {"status": "error", "message": f"فشل تشغيل الخدمة: {result.stderr}"}
        else:
            if not os.path.exists(service.path):
                return {"status": "error", "message": f"المسار غير موجود: {service.path}"}
            process = subprocess.Popen(service.start_command.split(), cwd=service.path, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            service.is_running = True
            service.process_id = process.pid
            db.add(service)
            db.commit()
            db.refresh(service)
            return {"status": "success", "message": f"تم تشغيل {service.name} بنجاح", "url": f"http://{server_ip}:{service.port}", "process_id": process.pid}
    except Exception as e:
        return {"status": "error", "message": f"فشل تشغيل الخدمة: {str(e)}"}


def stop_default_service(db: Session, service_id: int) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    try:
        if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
            if not _runtime_is_running(service, db):
                return {"status": "warning", "message": "الخدمة متوقفة بالفعل"}
            viewer_settings = get_or_create_viewer_page_settings(db)
            viewer_settings.is_enabled = False
            db.add(viewer_settings)
            db.commit()
            service.is_running = False
            service.process_id = None
            db.add(service)
            db.commit()
            db.refresh(service)
            return {"status": "success", "message": f"تم إيقاف {service.name} بنجاح"}
        elif service.start_command.startswith("systemctl"):
            service_name = service.start_command.split()[-1]
            # إيقاف وإلغاء التشغيل التلقائي عند الإقلاع (يتوافق مع تعطيل الخدمة من اللوحة)
            # لا نعتمد على is_running: قد تكون متوقفة لكن ما زالت مفعّلة للإقلاع
            result = subprocess.run(
                ["systemctl", "disable", "--now", service_name],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if result.returncode == 0:
                _clear_systemd_runtime_fields(service)
                db.add(service)
                db.commit()
                db.refresh(service)
                return {"status": "success", "message": f"تم إيقاف {service.name} بنجاح"}
            return {"status": "error", "message": f"فشل إيقاف الخدمة: {result.stderr}"}
        else:
            if not _runtime_is_running(service, db):
                return {"status": "warning", "message": "الخدمة متوقفة بالفعل"}
            import psutil as _psutil
            if service.process_id:
                try:
                    process = _psutil.Process(service.process_id)
                    process.terminate()
                    process.wait(timeout=10)
                except _psutil.NoSuchProcess:
                    pass
                except _psutil.TimeoutExpired:
                    process.kill()
            service.is_running = False
            service.process_id = None
            db.add(service)
            db.commit()
            db.refresh(service)
            return {"status": "success", "message": f"تم إيقاف {service.name} بنجاح"}
    except Exception as e:
        service.is_running = False
        service.process_id = None
        db.add(service)
        db.commit()
        return {"status": "warning", "message": f"تم تحديث حالة الخدمة ولكن قد لا تكون متوقفة تماماً: {str(e)}"}


def restart_default_service(db: Session, service_id: int, base_url: Optional[str] = None) -> dict:
    stop_default_service(db, service_id)
    time.sleep(2)
    result = start_default_service(db, service_id, base_url=base_url)
    if result["status"] == "success":
        return {"status": "success", "message": "تم إعادة تشغيل الخدمة بنجاح", "url": result.get("url")}
    return {"status": "error", "message": f"فشل إعادة التشغيل: {result.get('message')}"}


def toggle_default_service(db: Session, service_id: int) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    try:
        was_active = service.is_active
        service.is_active = not service.is_active
        db.add(service)
        db.commit()
        db.refresh(service)
        if service.is_active and not was_active:
            start_result = start_default_service(db, service_id)
            message = f"تم تفعيل وتشغيل {service.name} بنجاح" if start_result["status"] == "success" else f"تم تفعيل {service.name} لكن فشل في التشغيل: {start_result.get('message', '')}"
        elif not service.is_active and was_active:
            unit = _systemd_unit(service)
            if unit:
                stop_default_service(db, service_id)
                message = f"تم تعطيل وإيقاف {service.name} بنجاح"
            elif _runtime_is_running(service, db):
                stop_default_service(db, service_id)
                message = f"تم تعطيل وإيقاف {service.name} بنجاح"
            else:
                status_text = "معطلة"
                message = f"تم تغيير حالة {service.name} إلى {status_text}"
        else:
            status_text = "مفعلة" if service.is_active else "معطلة"
            message = f"تم تغيير حالة {service.name} إلى {status_text}"
        db.refresh(service)
        live = _runtime_is_running(service, db)
        return {"status": "success", "message": message, "is_active": service.is_active, "is_running": live}
    except Exception as e:
        return {"status": "error", "message": f"فشل تغيير حالة الخدمة: {str(e)}"}


def check_service_status(db: Session, service_id: int, base_url: Optional[str] = None) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    try:
        server_ip = get_server_ip()
        if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
            viewer_settings = get_or_create_viewer_page_settings(db)
            is_actually_running = viewer_settings.is_enabled
            if service.is_running != is_actually_running:
                service.is_running = is_actually_running
                db.add(service)
                db.commit()
                db.refresh(service)
            url = _service_url(service, server_ip, base_url, is_running=is_actually_running)
            return {"status": "success", "is_running": is_actually_running, "is_active": service.is_active, "url": url, "process_id": None}

        unit = _systemd_unit(service)
        if unit:
            is_actually_running = _systemctl_is_active(unit)
            pid = None
            if is_actually_running:
                pid_result = subprocess.run(
                    ["systemctl", "show", unit, "--property=MainPID", "--value"],
                    capture_output=True, text=True, timeout=15,
                )
                if pid_result.returncode == 0 and pid_result.stdout.strip().isdigit():
                    pid = int(pid_result.stdout.strip())
            _clear_systemd_runtime_fields(service)
            db.add(service)
            db.commit()
            db.refresh(service)
            url = f"http://{server_ip}:{service.port}" if is_actually_running else None
            return {"status": "success", "is_running": is_actually_running, "is_active": service.is_active, "url": url, "process_id": pid}

        import psutil as _psutil
        is_actually_running = False
        pid = None
        if service.process_id:
            try:
                proc = _psutil.Process(service.process_id)
                is_actually_running = proc.is_running()
                pid = service.process_id if is_actually_running else None
            except _psutil.NoSuchProcess:
                is_actually_running = False
        if service.is_running != is_actually_running or service.process_id != pid:
            service.is_running = is_actually_running
            service.process_id = pid
            db.add(service)
            db.commit()
            db.refresh(service)
        url = f"http://{server_ip}:{service.port}" if is_actually_running else None
        return {"status": "success", "is_running": is_actually_running, "is_active": service.is_active, "url": url, "process_id": pid}
    except Exception as e:
        return {"status": "error", "message": f"فشل فحص حالة الخدمة: {str(e)}"}
