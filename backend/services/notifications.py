"""
Notifications service
"""
import json
import os
from datetime import datetime
from sqlmodel import select
from backend import models

VAPID_KEYS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "vapid_keys.json"
)
VAPID_CONTACT = "mailto:admin@zero.local"


def get_or_generate_vapid_keys():
    if os.path.exists(VAPID_KEYS_FILE):
        with open(VAPID_KEYS_FILE, 'r') as f:
            return json.load(f)
    try:
        # Try py_vapid first (from pywebpush)
        from py_vapid import Vapid
        vapid = Vapid()
        vapid.generate_keys()
        pub = vapid.public_key_urlsafe_base64()
        priv = vapid.private_pem()
        if isinstance(priv, bytes):
            priv = priv.decode('utf-8')
        keys = {"public_key": pub, "private_key": priv}
    except ImportError:
        try:
            # Fallback: generate using cryptography library
            import base64
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives import serialization

            private_key = ec.generate_private_key(ec.SECP256R1())
            # Public key - uncompressed point (65 bytes), skip first byte (0x04)
            pub_numbers = private_key.public_key().public_numbers()
            x_bytes = pub_numbers.x.to_bytes(32, 'big')
            y_bytes = pub_numbers.y.to_bytes(32, 'big')
            # applicationServerKey needs uncompressed point: 0x04 + x + y
            raw_pub = b'\x04' + x_bytes + y_bytes
            pub = base64.urlsafe_b64encode(raw_pub).rstrip(b'=').decode('ascii')

            # Private key in PEM format for pywebpush
            priv = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode('utf-8')

            keys = {"public_key": pub, "private_key": priv}
        except Exception as e:
            print(f"Failed to generate VAPID keys: {e}")
            return {"public_key": "", "private_key": ""}

    with open(VAPID_KEYS_FILE, 'w') as f:
        json.dump(keys, f, indent=2)
    return keys


def get_vapid_public_key():
    keys = get_or_generate_vapid_keys()
    return keys.get("public_key", "")


def create_notification(db, data):
    notification = models.Notification(
        title=data.title, body=data.body,
        icon_url=data.icon_url, link_url=data.link_url,
        notification_type=data.notification_type,
        scheduled_at=data.scheduled_at,
        is_sent=False, created_at=datetime.utcnow().isoformat()
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    if data.notification_type == "instant":
        send_notification_to_all(db, notification)
    return notification


def get_notifications(db, skip=0, limit=50):
    return list(db.exec(
        select(models.Notification).order_by(
            models.Notification.id.desc()
        ).offset(skip).limit(limit)
    ).all())


def get_notification(db, nid):
    return db.get(models.Notification, nid)


def delete_notification(db, nid):
    n = db.get(models.Notification, nid)
    if not n:
        return False
    db.delete(n)
    db.commit()
    return True


def get_public_notifications(db, limit=10):
    return list(db.exec(
        select(models.Notification).where(
            models.Notification.is_sent == True  # noqa: E712
        ).order_by(models.Notification.id.desc()).limit(limit)
    ).all())


def subscribe_push(db, data):
    existing = db.exec(
        select(models.PushSubscription).where(
            models.PushSubscription.endpoint == data.endpoint
        )
    ).first()
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing
    sub = models.PushSubscription(
        endpoint=data.endpoint, p256dh=data.p256dh,
        auth=data.auth, created_at=datetime.utcnow().isoformat()
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def unsubscribe_push(db, endpoint):
    sub = db.exec(
        select(models.PushSubscription).where(
            models.PushSubscription.endpoint == endpoint
        )
    ).first()
    if sub:
        db.delete(sub)
        db.commit()
        return True
    return False


def get_subscribers_count(db):
    return len(db.exec(select(models.PushSubscription)).all())


def send_notification_to_all(db, notification):
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        notification.is_sent = True
        notification.sent_at = datetime.utcnow().isoformat()
        db.add(notification)
        db.commit()
        return {"sent": 0, "failed": 0, "message": "pywebpush not installed"}

    keys = get_or_generate_vapid_keys()
    if not keys.get("private_key") or not keys.get("public_key"):
        notification.is_sent = True
        notification.sent_at = datetime.utcnow().isoformat()
        db.add(notification)
        db.commit()
        return {"sent": 0, "failed": 0, "message": "no VAPID keys"}

    subscribers = db.exec(select(models.PushSubscription)).all()
    payload = json.dumps({
        "title": notification.title,
        "body": notification.body,
        "icon": notification.icon_url or "/logo192.png",
        "url": notification.link_url or "/",
        "id": notification.id
    }, ensure_ascii=False)

    sent = 0
    failed = 0
    to_remove = []

    for sub in subscribers:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth}
                },
                data=payload,
                vapid_private_key=keys["private_key"],
                vapid_claims={"sub": VAPID_CONTACT}
            )
            sent += 1
        except WebPushException as e:
            if "410" in str(e) or "404" in str(e):
                to_remove.append(sub)
            failed += 1
        except Exception:
            failed += 1

    for sub in to_remove:
        db.delete(sub)

    notification.is_sent = True
    notification.sent_at = datetime.utcnow().isoformat()
    db.add(notification)
    db.commit()
    return {"sent": sent, "failed": failed}


def send_scheduled_notifications(db):
    now = datetime.utcnow().isoformat()
    pending = db.exec(
        select(models.Notification).where(
            models.Notification.notification_type == "scheduled",
            models.Notification.is_sent == False,  # noqa: E712
            models.Notification.scheduled_at <= now
        )
    ).all()
    results = []
    for notification in pending:
        result = send_notification_to_all(db, notification)
        results.append({"id": notification.id, **result})
    return {"processed": len(results), "details": results}
