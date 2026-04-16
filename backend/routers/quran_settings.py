from typing import List

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import check_auth
from backend.services import quran_settings as quran_service


router = APIRouter()


@router.get("/api/quran/settings", tags=["Quran Settings"])
def get_quran_settings(auth: str = Depends(check_auth)):
    return quran_service.get_settings_payload()


@router.post("/api/quran/settings/select-reciters", tags=["Quran Settings"])
def select_reciers(payload: dict, auth: str = Depends(check_auth)):
    ids: List[int] = payload.get("reciter_ids") if isinstance(payload, dict) else []
    return quran_service.save_selected_reciters(ids or [])


@router.post("/api/quran/download/start", tags=["Quran Settings"])
def start_download(payload: dict, auth: str = Depends(check_auth)):
    ids: List[int] = payload.get("reciter_ids") if isinstance(payload, dict) else []
    result = quran_service.start_download(ids or [])
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "فشل بدء التنزيل"))
    return result


@router.get("/api/quran/download/status", tags=["Quran Settings"])
def get_download_status(auth: str = Depends(check_auth)):
    return quran_service.get_download_state()


@router.post("/api/quran/download/pause", tags=["Quran Settings"])
def pause_download(auth: str = Depends(check_auth)):
    result = quran_service.pause_download()
    return result


@router.post("/api/quran/download/resume", tags=["Quran Settings"])
def resume_download(auth: str = Depends(check_auth)):
    result = quran_service.resume_download()
    return result


@router.post("/api/quran/download/stop", tags=["Quran Settings"])
def stop_download(auth: str = Depends(check_auth)):
    result = quran_service.stop_download()
    return result

