"""راوتر النظام: التحديثات، الإصدار، حالة التحديث، أوامر الطاقة."""
import subprocess
import threading
import time
from fastapi import APIRouter, Depends, HTTPException, status
from backend import services
from backend.auth import check_auth
from backend.models import AdminUser

router = APIRouter()


def require_owner(user: AdminUser = Depends(check_auth)) -> AdminUser:
    if getattr(user, "role", None) != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="يتطلب صلاحية المالك",
        )
    return user


def require_owner_or_manager(user: AdminUser = Depends(check_auth)) -> AdminUser:
    role = getattr(user, "role", None)
    if role not in ("owner", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="يتطلب صلاحية المالك أو المدير",
        )
    return user


def _schedule_shell_command(cmd: list[str], delay_sec: float = 1.0) -> None:
    """تنفيذ أمر بعد تأخير قصير حتى تُرسل استجابة HTTP."""

    def _run() -> None:
        time.sleep(delay_sec)
        try:
            subprocess.run(cmd, timeout=120, check=False)
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()


@router.get("/api/system/version", tags=["System Update"])
def get_system_version():
    """الحصول على إصدار النظام الحالي."""
    return {"version": services.get_current_version()}


@router.get("/api/system/check-update", tags=["System Update"])
def check_system_update(username: str = Depends(check_auth)):
    """فحص وجود تحديث جديد من GitHub Releases."""
    return services.check_for_updates()


@router.post("/api/system/update", tags=["System Update"])
def start_system_update(username: str = Depends(check_auth)):
    """بدء عملية التحديث (تنزيل + بناء + إعادة تشغيل)."""
    update_info = services.check_for_updates()
    if not update_info.get("has_update"):
        return {"status": "error", "message": "لا يوجد تحديث متاح"}
    target = update_info.get("latest_version", "")
    return services.start_update(target_version=target)


@router.get("/api/system/update-status", tags=["System Update"])
def get_system_update_status(username: str = Depends(check_auth)):
    """الحصول على حالة عملية التحديث الجارية."""
    return services.get_update_status()


@router.post("/api/system/power/reboot", tags=["System Power"])
def system_power_reboot(_user: AdminUser = Depends(require_owner_or_manager)):
    """إعادة تشغيل الجهاز (يتطلب صلاحية المالك أو المدير)."""
    _schedule_shell_command(["shutdown", "-r", "now"], 1.0)
    return {"status": "ok", "message": "جاري إعادة تشغيل الجهاز..."}


@router.post("/api/system/power/shutdown", tags=["System Power"])
def system_power_shutdown(_user: AdminUser = Depends(require_owner_or_manager)):
    """إيقاف تشغيل الجهاز (يتطلب صلاحية المالك أو المدير)."""
    _schedule_shell_command(["shutdown", "-h", "now"], 1.0)
    return {"status": "ok", "message": "جاري إيقاف تشغيل الجهاز..."}


@router.post("/api/system/power/restart-zero-service", tags=["System Power"])
def system_restart_zero_service(_user: AdminUser = Depends(require_owner_or_manager)):
    """إعادة تشغيل خدمة Zero فقط دون إعادة تشغيل النظام."""
    _schedule_shell_command(["systemctl", "restart", "zero"], 1.0)
    return {"status": "ok", "message": "جاري إعادة تشغيل خدمة Zero..."}
