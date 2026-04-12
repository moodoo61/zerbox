"""إدارة البث: الاشتراكات، القنوات، المفاتيح، المزامنة."""
import json
import time
import requests
from typing import List, Dict, Any, Optional
from pathlib import Path
from sqlmodel import Session, select
from .. import models
from .mistserver import (
    build_source_url_with_quality,
    check_mistserver_connection,
    create_mistserver_stream,
    get_mistserver_streams,
    delete_all_mistserver_streams,
    normalize_video_quality,
    DEFAULT_VIDEO_QUALITY,
)

_DEFAULT_ADVANCED = {
    "DVR": 200000,
    "pagetimeout": 180,
    "maxkeepaway": 195000,
    "inputtimeout": 120,
    "segmentsize": 6000,
}
_VERIFY_RETRY_DELAY_SECONDS = 60
_VERIFY_MAX_ATTEMPTS = 2


class ExternalServerConnectionError(Exception):
    """فشل اتصال مؤقت بخادم الاشتراك الخارجي."""
    pass


def _is_temporary_external_failure(error: Exception) -> bool:
    msg = str(error).lower()
    indicators = (
        "temporary failure in name resolution",
        "name resolution",
        "failed to establish a new connection",
        "max retries exceeded",
        "connection error",
        "newconnectionerror",
        "timed out",
        "timeout",
    )
    return any(i in msg for i in indicators) or isinstance(error, ExternalServerConnectionError)


def _public_activation_error_message(error: Exception) -> str:
    if isinstance(error, ExternalServerConnectionError) or _is_temporary_external_failure(error):
        return "تعذر الاتصال بخادم الاشتراك حالياً. يرجى التحقق من اتصال الإنترنت والمحاولة لاحقاً."
    msg = str(error)
    if "المفتاح غير صالح" in msg or "منتهي الصلاحية" in msg:
        return "المفتاح غير صالح أو منتهي الصلاحية."
    if "لم يتم العثور على ملف المفتاح" in msg:
        return "لم يتم العثور على ملف المفتاح."
    if "سيرفر المشاهدة" in msg:
        return "سيرفر المشاهدة غير متاح حالياً."
    return "تعذر تفعيل خدمة البث حالياً."


def get_or_create_streaming_subscription(db: Session) -> models.StreamingSubscription:
    subscription = db.get(models.StreamingSubscription, 1)
    if not subscription:
        subscription = models.StreamingSubscription(id=1, subscription_data="", is_active=False)
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
    return subscription


def generate_key_from_server(device_uuid: str) -> Optional[str]:
    """إرسال معرّف الجهاز إلى الخادم للحصول على مفتاح بث جديد."""
    generate_url = "https://to.zerolag.live/api/channels/generate/?user="
    try:
        print(f"🔑 طلب مفتاح جديد من: {generate_url + device_uuid}")
        response = requests.get(
            generate_url + device_uuid,
            timeout=30,
        )
        if response.ok:
            data = response.json()
            key = data.get("key") or data.get("token") or data.get("channel_key")
            if key:
                print(f"✅ تم الحصول على مفتاح جديد من الخادم")
                return key
            keys_in_data = [v for v in data.values() if isinstance(v, str) and len(v) > 20]
            if keys_in_data:
                print(f"✅ تم الحصول على مفتاح جديد من الخادم")
                return keys_in_data[0]
        print(f"⚠️ فشل في توليد مفتاح جديد: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"⚠️ خطأ في الاتصال بخادم توليد المفاتيح: {e}")
    return None


def save_key_to_file(key: str) -> bool:
    """حفظ المفتاح في ملف kay.json."""
    from ..paths import PROJECT_ROOT
    key_path = Path(PROJECT_ROOT) / "kay.json"
    try:
        with open(key_path, "w", encoding="utf-8") as f:
            json.dump({key: "1"}, f, indent=2)
        print(f"✅ تم حفظ المفتاح في {key_path}")
        return True
    except Exception as e:
        print(f"❌ فشل في حفظ المفتاح: {e}")
        return False


def refresh_key_on_startup() -> Optional[str]:
    """توليد مفتاح جديد عند بدء التشغيل عبر إرسال UUID البوردة إلى الخادم."""
    from .system_stats import get_device_id
    print("🔄 بدء عملية توليد مفتاح جديد...")
    device_uuid = get_device_id()
    print(f"📱 معرّف الجهاز (UUID): {device_uuid}")

    new_key = generate_key_from_server(device_uuid)
    if new_key:
        save_key_to_file(new_key)
        return new_key

    print("⚠️ لم يتم الحصول على مفتاح جديد، سيتم استخدام المفتاح المحلي إن وجد")
    return read_local_key()


def read_local_key() -> Optional[str]:
    from ..paths import PROJECT_ROOT
    possible_paths = [
        Path("key.json"), Path("kay.json"),
        Path(PROJECT_ROOT) / "key.json", Path(PROJECT_ROOT) / "kay.json",
    ]
    for key_path in possible_paths:
        try:
            if key_path.exists():
                with open(key_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        keys = list(data.keys())
                        if keys:
                            return keys[0]
        except Exception as e:
            print(f"خطأ في قراءة {key_path}: {e}")
    return None


def verify_key_and_fetch_channels(key: str) -> Dict[str, Any]:
    verify_url = "https://to.zerolag.live/api/channels/verify-key/"
    channels_url = "https://to.zerolag.live/api/channels/"
    try:
        print(f"🔑 التحقق من المفتاح عبر: {verify_url}")
        verify_response = requests.post(verify_url, json={"key": key}, timeout=30, headers={"Content-Type": "application/json"})
        if not verify_response.ok:
            raise Exception(f"فشل التحقق من المفتاح: {verify_response.status_code} - {verify_response.text}")
        verify_data = verify_response.json()
        print(f"✅ نتيجة التحقق: {verify_data}")
        is_valid = False
        if isinstance(verify_data, dict):
            if verify_data.get("status") == "success" or verify_data.get("valid") == True or verify_data.get("verified") == True:
                is_valid = True
        if not is_valid:
            raise Exception("المفتاح غير صالح أو منتهي الصلاحية")

        print(f"📡 جلب القنوات من: {channels_url}")
        channels_response = requests.get(channels_url, timeout=30, headers={"Content-Type": "application/json", "X-Channel-Key": key})
        if not channels_response.ok:
            raise Exception(f"فشل جلب القنوات: {channels_response.status_code} - {channels_response.text}")
        channels_data = channels_response.json()
        channels_list = channels_data.get("channels", channels_data.get("القنوات", []))
        if not channels_list or not isinstance(channels_list, list):
            return {"status": "error", "channels": {}, "message": "لا توجد قنوات متاحة أو صيغة البيانات غير صحيحة"}

        formatted_channels = {}
        total_channels = 0
        for distributor in channels_list:
            if not distributor.get("is_active", True):
                continue
            for quality in distributor.get("qualities", []):
                if not quality.get("is_active", True):
                    continue
                channel_name_ar = quality.get("name", f"channel_{quality.get('id', total_channels)}")
                channel_url = quality.get("url", "")
                notes = quality.get("notes", "")
                player = quality.get("player", "")
                channel_id = quality.get("id", total_channels)
                channel_name_en = f"ch{channel_id}" if channel_id else f"ch{total_channels + 1}"
                if channel_url:
                    formatted_channels[channel_name_en] = {
                        "الرابط": channel_url, "url": channel_url,
                        "ملاحضه": notes, "note": notes,
                        "المشغل": player, "player": player,
                        "arabic_name": channel_name_ar, "display_name": channel_name_ar,
                    }
                    total_channels += 1

        if formatted_channels:
            print(f"✅ تم جلب {total_channels} قناة")
            return {"status": "success", "channels": formatted_channels, "message": f"تم التحقق من المفتاح وجلب {total_channels} قناة بنجاح"}
        return {"status": "error", "channels": {}, "message": "لا توجد قنوات نشطة متاحة"}
    except requests.exceptions.RequestException as e:
        raise ExternalServerConnectionError(str(e))
    except Exception as e:
        raise Exception(str(e))


def activate_streaming_service(db: Session, subscription_data=None) -> models.StreamingSubscription:
    subscription = get_or_create_streaming_subscription(db)
    try:
        mist_check = check_mistserver_connection()
        if mist_check["status"] != "success":
            raise Exception(mist_check["message"])

        key = read_local_key()
        if not key:
            raise Exception("لم يتم العثور على ملف المفتاح (key.json أو kay.json)")
        verification_result = None
        last_verify_error = None
        for attempt in range(1, _VERIFY_MAX_ATTEMPTS + 1):
            try:
                verification_result = verify_key_and_fetch_channels(key)
                last_verify_error = None
                break
            except Exception as e:
                last_verify_error = e
                should_retry = attempt < _VERIFY_MAX_ATTEMPTS and _is_temporary_external_failure(e)
                if should_retry:
                    print(f"⚠️ فشل الاتصال بخادم الاشتراك (محاولة {attempt}/{_VERIFY_MAX_ATTEMPTS}) — إعادة المحاولة بعد {_VERIFY_RETRY_DELAY_SECONDS} ثانية")
                    time.sleep(_VERIFY_RETRY_DELAY_SECONDS)
                    continue
                break
        if last_verify_error is not None:
            raise last_verify_error
        if verification_result["status"] != "success":
            raise Exception(verification_result.get("message", "فشل التحقق من المفتاح"))
        channels_data = verification_result["channels"]
        existing_channels = db.exec(select(models.Channel)).all()
        previous_channels_by_key = {}
        for ch in existing_channels:
            key_name = ch.stream_key or ch.name
            try:
                previous_quality = normalize_video_quality(getattr(ch, "video_quality", None))
            except ValueError:
                previous_quality = DEFAULT_VIDEO_QUALITY
            previous_channels_by_key[key_name] = {
                "video_quality": previous_quality,
                "advanced": {
                    "DVR": int(getattr(ch, "dvr", 200000) or 200000),
                    "pagetimeout": int(getattr(ch, "pagetimeout", 180) or 180),
                    "maxkeepaway": int(getattr(ch, "maxkeepaway", 195000) or 195000),
                    "inputtimeout": int(getattr(ch, "inputtimeout", 120) or 120),
                    "segmentsize": int(getattr(ch, "segmentsize", 6000) or 6000),
                    "always_on": bool(getattr(ch, "always_on", False)),
                },
            }
        delete_result = delete_all_mistserver_streams()
        print(f"حذف القنوات القديمة: {delete_result}")
        for existing_channel in existing_channels:
            db.delete(existing_channel)
        db.commit()

        added_channels = []
        failed_channels = []
        mistserver_success = []
        print(f"\n📺 إضافة {len(channels_data)} قناة...")
        for i, (channel_name, channel_info) in enumerate(channels_data.items()):
            try:
                if isinstance(channel_info, dict):
                    stream_url = channel_info.get("الرابط", channel_info.get("url", ""))
                    note = channel_info.get("ملاحضه", channel_info.get("note", ""))
                    display_name = channel_info.get("display_name", channel_info.get("arabic_name", channel_name))
                else:
                    stream_url = str(channel_info)
                    note = ""
                    display_name = channel_name
                if not stream_url:
                    continue
                previous_cfg = previous_channels_by_key.get(channel_name, {})
                quality = previous_cfg.get("video_quality", DEFAULT_VIDEO_QUALITY)
                advanced = previous_cfg.get("advanced", _DEFAULT_ADVANCED)
                source_url = build_source_url_with_quality(stream_url, quality)
                try:
                    create_mistserver_stream(channel_name, source_url, advanced)
                    mistserver_success.append(channel_name)
                except Exception as e:
                    failed_channels.append(f"{channel_name}: {e}")
                channel = models.Channel(
                    name=display_name,
                    url=stream_url,
                    category=note if note else "مباشر",
                    sort_order=i,
                    is_active=True,
                    stream_key=channel_name,
                    video_quality=quality,
                    dvr=int(advanced.get("DVR", 200000)),
                    pagetimeout=int(advanced.get("pagetimeout", 180)),
                    maxkeepaway=int(advanced.get("maxkeepaway", 195000)),
                    inputtimeout=int(advanced.get("inputtimeout", 120)),
                    segmentsize=int(advanced.get("segmentsize", 6000)),
                    always_on=bool(advanced.get("always_on", False)),
                )
                db.add(channel)
                added_channels.append(display_name)
            except Exception as e:
                failed_channels.append(f"{channel_name}: {e}")

        subscription.subscription_data = key[:20] + "..." if len(key) > 20 else key
        subscription.is_active = True
        subscription.activation_date = time.strftime("%Y-%m-%d %H:%M:%S")
        subscription.external_server_url = "https://to.zerolag.live"
        subscription.last_sync_date = time.strftime("%Y-%m-%d %H:%M:%S")
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        print(f"تم تفعيل الخدمة بنجاح. تمت إضافة {len(added_channels)} قناة")
        return subscription
    except Exception as e:
        # عند فشل التفعيل لا نُبقي قنوات ظاهرة في الإدارة/المشاهدة
        try:
            delete_all_mistserver_streams()
        except Exception:
            pass
        for existing_channel in db.exec(select(models.Channel)).all():
            db.delete(existing_channel)
        db.commit()

        public_error = _public_activation_error_message(e)
        subscription.subscription_data = f"Error: {public_error}"
        subscription.is_active = False
        subscription.activation_date = time.strftime("%Y-%m-%d %H:%M:%S")
        subscription.external_server_url = "فشل التفعيل"
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        raise Exception(public_error)


def get_streaming_channels(db: Session, skip: int = 0, limit: int = 100) -> List[models.Channel]:
    statement = select(models.Channel).where(models.Channel.is_active == True).order_by(models.Channel.sort_order).offset(skip).limit(limit)
    return db.exec(statement).all()


def add_test_channel(db: Session, source_url: str):
    for existing_channel in db.exec(select(models.Channel)).all():
        db.delete(existing_channel)
    db.add(models.Channel(name="ch1", url=source_url, category="تجريبي", sort_order=1))
    db.commit()


def sync_channels_from_mistserver(db: Session) -> dict:
    try:
        streams_data = get_mistserver_streams()
        for existing_channel in db.exec(select(models.Channel)).all():
            db.delete(existing_channel)
        streams = streams_data.get("streams", {})
        for i, (stream_name, stream_info) in enumerate(streams.items()):
            db.add(models.Channel(name=stream_name, url=stream_info.get("source", ""), category="مباشر", sort_order=i))
        db.commit()
        return {"status": "success", "message": f"تم مزامنة {len(streams)} قناة من سيرفر البث المحلي"}
    except Exception as e:
        add_test_channel(db, "dtsc://s2.zerolagvpn.com/ch3")
        return {"status": "warning", "message": f"فشل الاتصال بسيرفر البث المحلي، تم إضافة قناة تجريبية: {str(e)}"}


def sync_channels_from_external_server(db: Session) -> dict:
    subscription = get_or_create_streaming_subscription(db)
    if not subscription.is_active:
        return {"status": "error", "message": "Streaming service is not activated"}
    sample_channels = [
        {"name": "القناة الأولى", "url": "http://example.com/channel1", "category": "عام"},
        {"name": "القناة الرياضية", "url": "http://example.com/sports", "category": "رياضة"},
        {"name": "قناة الأخبار", "url": "http://example.com/news", "category": "أخبار"},
        {"name": "قناة المسلسلات", "url": "http://example.com/drama", "category": "درامي"},
        {"name": "قناة الأطفال", "url": "http://example.com/kids", "category": "أطفال"},
    ]
    for existing_channel in db.exec(select(models.Channel)).all():
        db.delete(existing_channel)
    for i, ch in enumerate(sample_channels):
        db.add(models.Channel(name=ch["name"], url=ch["url"], category=ch["category"], sort_order=i))
    subscription.last_sync_date = time.strftime("%Y-%m-%d %H:%M:%S")
    db.add(subscription)
    db.commit()
    return {"status": "success", "message": f"Synced {len(sample_channels)} channels"}
