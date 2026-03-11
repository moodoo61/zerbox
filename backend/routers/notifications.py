"""راوتر الإشعارات والاشتراكات الدفعية (Push)."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from backend import models, services
from backend.database import get_session
from backend.auth import check_auth

router = APIRouter()


# ===================== Notifications API =====================

@router.post("/api/notifications/", response_model=models.NotificationRead, status_code=status.HTTP_201_CREATED, tags=["Notifications"])
def create_notification_endpoint(
    data: models.NotificationCreate,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """إنشاء إشعار جديد (فوري أو مجدول)"""
    return services.create_notification(db=db, data=data)


@router.get("/api/notifications/", response_model=List[models.NotificationRead], tags=["Notifications"])
def list_notifications(
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """جلب جميع الإشعارات"""
    return services.get_notifications(db=db, skip=skip, limit=limit)


@router.delete("/api/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Notifications"])
def delete_notification_endpoint(
    notification_id: int,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """حذف إشعار"""
    if not services.delete_notification(db=db, nid=notification_id):
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")


@router.get("/api/notifications/public", tags=["Notifications"])
def get_public_notifications_endpoint(limit: int = 10, db: Session = Depends(get_session)):
    """جلب آخر الإشعارات المُرسلة (متاح للعامة)"""
    notifications = services.get_public_notifications(db=db, limit=limit)
    return {"status": "success", "notifications": [
        {"id": n.id, "title": n.title, "body": n.body, "icon_url": n.icon_url,
         "link_url": n.link_url, "sent_at": n.sent_at}
        for n in notifications
    ]}


@router.get("/api/notifications/stats", tags=["Notifications"])
def get_notification_stats(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """إحصائيات الإشعارات"""
    total = len(services.get_notifications(db=db, limit=9999))
    subscribers = services.get_subscribers_count(db=db)
    return {"total_notifications": total, "total_subscribers": subscribers}


@router.post("/api/notifications/send-scheduled", tags=["Notifications"])
def send_scheduled_endpoint(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """إرسال الإشعارات المجدولة التي حان وقتها"""
    return services.send_scheduled_notifications(db=db)


# ===================== Push Subscription API =====================

@router.get("/api/push/vapid-key", tags=["Push"])
def get_vapid_public_key():
    """الحصول على المفتاح العام لـ VAPID"""
    key = services.get_vapid_public_key()
    return {"public_key": key}


@router.post("/api/push/subscribe", tags=["Push"])
def push_subscribe(data: models.PushSubscriptionCreate, db: Session = Depends(get_session)):
    """تسجيل اشتراك في الإشعارات الدفعية"""
    sub = services.subscribe_push(db=db, data=data)
    return {"status": "success", "id": sub.id}


@router.post("/api/push/unsubscribe", tags=["Push"])
def push_unsubscribe(data: dict, db: Session = Depends(get_session)):
    """إلغاء اشتراك الإشعارات الدفعية"""
    endpoint = data.get("endpoint", "")
    if services.unsubscribe_push(db=db, endpoint=endpoint):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
