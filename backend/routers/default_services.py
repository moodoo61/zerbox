"""راوتر الخدمات الافتراضية (Default Services)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session
from backend import models, services
from backend.database import get_session
from backend.auth import check_auth

router = APIRouter()


@router.get("/api/default-services/", tags=["Default Services"])
def get_default_services(request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Get all default services."""
    base_url = str(request.base_url).rstrip("/")
    return services.get_default_services(db, base_url=base_url)


@router.get("/api/default-services/{service_id}", tags=["Default Services"])
def get_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Get a specific default service."""
    base_url = str(request.base_url).rstrip("/")
    service = services.get_default_service(db, service_id, base_url=base_url)
    if not service:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return service


@router.patch("/api/default-services/{service_id}", response_model=models.DefaultServiceRead, tags=["Default Services"])
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


@router.post("/api/default-services/{service_id}/toggle", tags=["Default Services"])
def toggle_default_service(service_id: int, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Toggle (activate/deactivate) a default service."""
    result = services.toggle_default_service(db, service_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/api/default-services/{service_id}/start", tags=["Default Services"])
def start_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Start a default service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.start_default_service(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/api/default-services/{service_id}/stop", tags=["Default Services"])
def stop_default_service(service_id: int, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Stop a default service."""
    result = services.stop_default_service(db, service_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/api/default-services/{service_id}/restart", tags=["Default Services"])
def restart_default_service(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Restart a default service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.restart_default_service(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/api/default-services/{service_id}/status", tags=["Default Services"])
def check_service_status(service_id: int, request: Request, db: Session = Depends(get_session), auth: str = Depends(check_auth)):
    """Check the actual status of a service."""
    base_url = str(request.base_url).rstrip("/")
    result = services.check_service_status(db, service_id, base_url=base_url)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result
