"""راوتر النظام: التحديثات، الإصدار، حالة التحديث."""
from fastapi import APIRouter, Depends
from backend import services
from backend.auth import check_auth

router = APIRouter()


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
