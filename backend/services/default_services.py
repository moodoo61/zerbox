"""إدارة الخدمات الافتراضية (القرآن الكريم، قافية، الاستراحة، البث المباشر)."""
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


def _service_url(service, server_ip: str, base_url: Optional[str] = None) -> Optional[str]:
    if not service.is_running:
        return None
    if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
        if base_url:
            return f"{base_url.rstrip('/')}/mubasher"
        return f"http://{server_ip}:{service.port}/mubasher"
    return f"http://{server_ip}:{service.port}"


def initialize_default_services(db: Session):
    try:
        existing_services = db.exec(select(models.DefaultService)).all()
        existing_names = [s.name for s in existing_services]
        # مسارات الخدمات الداخلية نسبةً لجذر المشروع؛ Jellyfin يبقى خارج المشروع
        root = PROJECT_ROOT
        all_default = [
            {"name": "القرآن الكريم", "path": os.path.join(root, "frontend", "quran"), "port": 8081, "start_command": "npm run serve -- --port 8081", "description": "تطبيق القرآن الكريم مع التلاوة والتفسير", "is_active": False, "auto_start": False},
            {"name": "قافية", "path": os.path.join(root, "qafiyah", "apps", "web"), "port": 8082, "start_command": "npm run dev -- -p 8082", "description": "منصة الشعر العربي والقوافي", "is_active": False, "auto_start": False},
            {"name": "الاستراحة", "path": "/usr/lib/jellyfin", "port": 8096, "start_command": "systemctl start jellyfin", "description": "سيرفر الوسائط - مكتبة الأفلام والمسلسلات", "is_active": True, "is_running": True, "process_id": 713, "auto_start": False},
            {"name": "البث المباشر", "path": os.path.join(root, "frontend"), "port": 3000, "start_command": "viewer_page_toggle", "description": "صفحة مشاهدة البث المباشر للقنوات", "is_active": False, "is_running": False, "auto_start": False},
        ]
        added = []
        for sd in all_default:
            if sd["name"] not in existing_names:
                db.add(models.DefaultService(**sd))
                added.append(sd["name"])
        if added:
            db.commit()
            print(f"✅ تم إضافة الخدمات الافتراضية: {', '.join(added)}")
        try:
            viewer_service = db.exec(select(models.DefaultService).where(models.DefaultService.name == "البث المباشر")).first()
            if viewer_service:
                viewer_settings = get_or_create_viewer_page_settings(db)
                viewer_service.is_active = viewer_settings.is_enabled
                viewer_service.is_running = viewer_settings.is_enabled
                db.add(viewer_service)
                db.commit()
        except Exception as sync_error:
            print(f"⚠️ تحذير: فشل في مزامنة خدمة البث المباشر: {sync_error}")
        if not added:
            print(f"✅ توجد {len(existing_services)} خدمة افتراضية")
    except Exception as e:
        print(f"❌ خطأ في إنشاء الخدمات الافتراضية: {e}")


def get_default_services(db: Session, skip: int = 0, limit: int = 100, base_url: Optional[str] = None) -> List[Dict[str, Any]]:
    statement = select(models.DefaultService).offset(skip).limit(limit)
    services = db.exec(statement).all()
    server_ip = get_server_ip()
    return [{**s.dict(), "url": _service_url(s, server_ip, base_url)} for s in services]


def get_default_service(db: Session, service_id: int, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    service = db.get(models.DefaultService, service_id)
    if service:
        server_ip = get_server_ip()
        return {**service.dict(), "url": _service_url(service, server_ip, base_url)}
    return None


def update_default_service(db: Session, service_id: int, service_data: models.DefaultServiceUpdate, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    db_service = db.get(models.DefaultService, service_id)
    if db_service:
        for key, value in service_data.dict(exclude_unset=True).items():
            setattr(db_service, key, value)
        db.add(db_service)
        db.commit()
        db.refresh(db_service)
        server_ip = get_server_ip()
        return {**db_service.dict(), "url": _service_url(db_service, server_ip, base_url)}
    return None


def start_default_service(db: Session, service_id: int, base_url: Optional[str] = None) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    if not service.is_active:
        return {"status": "error", "message": "الخدمة غير مفعلة"}
    if service.is_running:
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
            viewer_url = _service_url(service, server_ip, base_url)
            return {"status": "success", "message": f"تم تشغيل {service.name} بنجاح", "url": viewer_url, "process_id": None}
        elif service.start_command.startswith("systemctl"):
            service_name = service.start_command.split()[-1]
            result = subprocess.run(service.start_command.split(), capture_output=True, text=True)
            if result.returncode == 0:
                pid_result = subprocess.run(["systemctl", "show", service_name, "--property=MainPID", "--value"], capture_output=True, text=True)
                pid = int(pid_result.stdout.strip()) if pid_result.returncode == 0 and pid_result.stdout.strip().isdigit() else None
                service.is_running = True
                service.process_id = pid
                db.add(service)
                db.commit()
                db.refresh(service)
                return {"status": "success", "message": f"تم تشغيل {service.name} بنجاح", "url": f"http://{server_ip}:{service.port}", "process_id": pid}
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
    if not service.is_running:
        return {"status": "warning", "message": "الخدمة متوقفة بالفعل"}
    try:
        if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
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
            result = subprocess.run(f"systemctl stop {service_name}".split(), capture_output=True, text=True)
            if result.returncode == 0:
                service.is_running = False
                service.process_id = None
                db.add(service)
                db.commit()
                db.refresh(service)
                return {"status": "success", "message": f"تم إيقاف {service.name} بنجاح"}
            return {"status": "error", "message": f"فشل إيقاف الخدمة: {result.stderr}"}
        else:
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
        elif not service.is_active and service.is_running:
            stop_default_service(db, service_id)
            message = f"تم تعطيل وإيقاف {service.name} بنجاح"
        else:
            status_text = "مفعلة" if service.is_active else "معطلة"
            message = f"تم تغيير حالة {service.name} إلى {status_text}"
        return {"status": "success", "message": message, "is_active": service.is_active, "is_running": service.is_running}
    except Exception as e:
        return {"status": "error", "message": f"فشل تغيير حالة الخدمة: {str(e)}"}


def check_service_status(db: Session, service_id: int, base_url: Optional[str] = None) -> dict:
    service = db.get(models.DefaultService, service_id)
    if not service:
        return {"status": "error", "message": "الخدمة غير موجودة"}
    try:
        is_actually_running = False
        pid = None
        server_ip = get_server_ip()
        if service.name == "البث المباشر" or service.start_command == "viewer_page_toggle":
            viewer_settings = get_or_create_viewer_page_settings(db)
            is_actually_running = viewer_settings.is_enabled
            if service.is_running != is_actually_running:
                service.is_running = is_actually_running
                db.add(service)
                db.commit()
                db.refresh(service)
            url = _service_url(service, server_ip, base_url)
            return {"status": "success", "is_running": is_actually_running, "is_active": service.is_active, "url": url, "process_id": None}
        elif service.start_command.startswith("systemctl"):
            service_name = service.start_command.split()[-1]
            result = subprocess.run(["systemctl", "is-active", service_name], capture_output=True, text=True)
            is_actually_running = result.returncode == 0 and result.stdout.strip() == "active"
            if is_actually_running:
                pid_result = subprocess.run(["systemctl", "show", service_name, "--property=MainPID", "--value"], capture_output=True, text=True)
                if pid_result.returncode == 0 and pid_result.stdout.strip().isdigit():
                    pid = int(pid_result.stdout.strip())
        else:
            import psutil as _psutil
            if service.process_id:
                try:
                    process = _psutil.Process(service.process_id)
                    is_actually_running = process.is_running()
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
