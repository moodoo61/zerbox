"""راوتر البث المباشر وسيرفر المشاهدة MistServer والقنوات وصفحة المشاهدة والمباريات."""
import asyncio
import json
import base64
import time as _time
import requests as _requests
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from sqlmodel import Session, select
from backend import models, services
from backend.database import get_session
from backend.auth import check_auth
from backend.services.system_log import log_event

router = APIRouter()

# ── MistServer WebSocket → Frontend broadcaster ──

_MIST_STATUS = {0: "offline", 1: "init", 2: "boot", 3: "wait", 4: "ready", 5: "shutdown", 6: "invalid"}


class _StreamBroadcaster:
    """Connects to MistServer WebSocket and broadcasts stream status to frontend clients."""

    def __init__(self):
        self._clients: set = set()
        self._stats: dict = {}
        self._task = None

    async def subscribe(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)
        if self._stats:
            try:
                await ws.send_json({"type": "init", "stats": self._stats})
            except Exception:
                self._clients.discard(ws)
                return
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._mist_loop())

    def unsubscribe(self, ws: WebSocket):
        self._clients.discard(ws)

    async def _mist_loop(self):
        try:
            import websockets
        except ImportError:
            return

        creds = base64.b64encode(
            f"{services.MISTSERVER_USERNAME}:{services.MISTSERVER_PASSWORD}".encode()
        ).decode()
        uri = f"ws://{services.MISTSERVER_HOST}:{services.MISTSERVER_PORT}/ws?streams=1"

        while self._clients:
            try:
                async with websockets.connect(
                    uri, additional_headers={"Authorization": f"Basic {creds}"}, close_timeout=5,
                ) as mist_ws:
                    async for raw in mist_ws:
                        if not self._clients:
                            break
                        try:
                            event = json.loads(raw)
                            if not (isinstance(event, list) and len(event) >= 2 and event[0] == "stream"):
                                continue
                            payload = event[1]
                            if not isinstance(payload, (list, tuple)) or len(payload) < 5:
                                continue
                            name = payload[0]
                            status_code = int(payload[1])
                            viewers = int(payload[2])
                            inputs = int(payload[3])
                            outputs = int(payload[4])
                            is_active = inputs > 0 and 1 <= status_code <= 4
                            stat = {
                                "status": "active" if is_active else _MIST_STATUS.get(status_code, "offline"),
                                "connections": viewers,
                                "inputs": inputs,
                                "outputs": outputs,
                            }
                            self._stats[name] = stat
                            await self._broadcast({"type": "update", "stream": name, **stat})
                        except (ValueError, KeyError, TypeError):
                            pass
            except Exception:
                if self._clients:
                    await asyncio.sleep(3)

    async def _broadcast(self, data: dict):
        dead = set()
        for ws in list(self._clients):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self._clients -= dead


_broadcaster = _StreamBroadcaster()


@router.websocket("/ws/stream-status")
async def ws_stream_status(websocket: WebSocket):
    """WebSocket endpoint — يرسل تحديثات حالة البث لحظياً من MistServer."""
    await _broadcaster.subscribe(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _broadcaster.unsubscribe(websocket)

# حالة التفعيل التلقائي عند الإقلاع — يُحدَّث من lifespan في main.py
auto_activation_result: dict = {"status": None, "message": None}


def _build_advanced_cfg(channel: models.Channel) -> dict:
    """بناء dict الإعدادات المتقدمة لـ MistServer من كائن القناة."""
    return {
        "DVR": getattr(channel, "dvr", 200000) or 200000,
        "pagetimeout": getattr(channel, "pagetimeout", 90) or 90,
        "maxkeepaway": getattr(channel, "maxkeepaway", 90000) or 90000,
        "inputtimeout": getattr(channel, "inputtimeout", 180) or 180,
        "always_on": bool(getattr(channel, "always_on", False)),
        "raw": bool(getattr(channel, "raw", False)),
    }


def _apply_channel_quality(db: Session, channel: models.Channel, quality) -> None:
    """تحديث جودة قناة واحدة في DB و MistServer (حذف وإعادة إضافة بالرابط الجديد)."""
    q = services.normalize_video_quality(quality)
    channel.video_quality = q
    stream_key = channel.stream_key or channel.name
    source_url = services.build_source_url_with_quality(channel.url, q)
    services.delete_mistserver_stream(stream_key)
    services.create_mistserver_stream(stream_key, source_url, _build_advanced_cfg(channel))
    db.add(channel)


# ===================== Streaming API =====================

@router.get("/api/streaming/status", response_model=models.StreamingSubscriptionRead, tags=["Streaming"])
def get_streaming_status(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """
    Get the current streaming subscription status.
    """
    subscription = services.get_or_create_streaming_subscription(db)
    return subscription


@router.get("/api/streaming/startup-result", tags=["Streaming"])
def get_startup_activation_result():
    """
    Get the result of auto-activation at startup.
    Returns whether streaming was auto-activated successfully when the system started.
    """
    return auto_activation_result


@router.post("/api/streaming/activate", response_model=models.StreamingSubscriptionRead, tags=["Streaming"])
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


@router.post("/api/streaming/refresh-channels", tags=["Streaming"])
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

        key = services.read_local_key()
        if not key:
            return {"status": "error", "message": "لم يتم العثور على مفتاح key.json"}

        result = services.verify_key_and_fetch_channels(key)

        if result.get("status") != "success":
            return {"status": "error", "message": result.get("message", "فشل في جلب القنوات")}

        channels_data = result.get("channels", {})

        added_count = 0
        updated_count = 0

        for i, (stream_key, channel_info) in enumerate(channels_data.items()):
            try:
                if isinstance(channel_info, dict):
                    stream_url = channel_info.get("الرابط", channel_info.get("url", ""))
                    display_name = channel_info.get("display_name", channel_info.get("arabic_name", stream_key))
                else:
                    stream_url = str(channel_info)
                    display_name = stream_key

                if not stream_url:
                    continue

                existing_channel = db.exec(
                    select(models.Channel).where(models.Channel.stream_key == stream_key)
                ).first()
                vq = getattr(existing_channel, "video_quality", None) if existing_channel else None
                quality = services.normalize_video_quality(vq)
                source_url = services.build_source_url_with_quality(stream_url, quality)

                if existing_channel:
                    try:
                        services.delete_mistserver_stream(stream_key)
                    except Exception:
                        pass
                adv = _build_advanced_cfg(existing_channel) if existing_channel else None
                services.create_mistserver_stream(stream_key, source_url, adv)

                if existing_channel:
                    existing_channel.url = stream_url
                    existing_channel.name = display_name
                    existing_channel.video_quality = quality
                    updated_count += 1
                else:
                    channel = models.Channel(
                        name=display_name,
                        url=stream_url,
                        category="مباشر",
                        sort_order=i,
                        is_active=True,
                        stream_key=stream_key,
                        video_quality=services.DEFAULT_VIDEO_QUALITY
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


@router.get("/api/streaming/channels", response_model=List[models.ChannelRead], tags=["Streaming"])
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


@router.post("/api/streaming/sync-channels", tags=["Streaming"])
def sync_channels_from_external_server(
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Sync channels from external streaming server.
    """
    return services.sync_channels_from_external_server(db=db)


@router.get("/api/streaming/check-mistserver", tags=["Streaming"])
def check_mistserver_status(username: str = Depends(check_auth)):
    """Quick check if MistServer is installed and running."""
    return services.check_mistserver_connection()


@router.get("/api/streaming/test-mistserver", tags=["Streaming"])
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


@router.get("/api/streaming/test-active-streams", tags=["Streaming"])
def test_active_streams_api(username: str = Depends(check_auth)):
    """
    Test active_streams API to debug statistics issues.
    """
    try:
        result = services.get_active_streams_stats()
        return {"status": "success", "message": "تم جلب إحصائيات القنوات النشطة", "data": result}
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب إحصائيات القنوات النشطة: {str(e)}"}


@router.delete("/api/streaming/channels/{channel_name}", tags=["Streaming"])
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
        channel = db.exec(
            select(models.Channel).where(
                (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
            )
        ).first()

        if not channel:
            return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}

        stream_key = channel.stream_key or channel.name

        print(f"🗑️ حذف {stream_key} من MistServer...")
        services.delete_mistserver_stream(stream_key)

        db.delete(channel)
        db.commit()

        return {"status": "success", "message": f"تم حذف القناة {channel.name} بنجاح من النظام و MistServer"}
    except Exception as e:
        return {"status": "error", "message": f"فشل في حذف القناة: {str(e)}"}


@router.post("/api/streaming/channels/{channel_name}/reconnect", tags=["Streaming"])
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


@router.post("/api/streaming/channels/{channel_name}/kick-viewers", tags=["Streaming"])
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


@router.patch("/api/streaming/channels/{channel_name}/quality", tags=["Streaming"])
def set_channel_quality(
    channel_name: str,
    body: dict,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Set video quality for a single channel (1280x720، 854x480، 512x288).
    """
    try:
        quality = body.get("quality")
        try:
            q = services.normalize_video_quality(quality)
        except ValueError:
            opts = "، ".join(services.VIDEO_QUALITY_DIMENSIONS)
            return {"status": "error", "message": f"يجب تحديد الجودة: {opts}"}
        channel = db.exec(
            select(models.Channel).where(
                (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
            )
        ).first()
        if not channel:
            return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}
        _apply_channel_quality(db, channel, q)
        db.commit()
        disp = q.replace("x", "×")
        return {"status": "success", "message": f"تم ضبط جودة القناة {channel.name} إلى {disp}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/streaming/channels/set-all-quality", tags=["Streaming"])
def set_all_channels_quality(
    body: dict,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Set video quality for all channels (1280x720، 854x480، 512x288).
    """
    try:
        quality = body.get("quality")
        try:
            q = services.normalize_video_quality(quality)
        except ValueError:
            opts = "، ".join(services.VIDEO_QUALITY_DIMENSIONS)
            return {"status": "error", "message": f"يجب تحديد الجودة: {opts}"}
        channels = db.exec(select(models.Channel)).all()
        if not channels:
            return {"status": "error", "message": "لا توجد قنوات"}
        for ch in channels:
            _apply_channel_quality(db, ch, q)
        db.commit()
        label = q.replace("x", "×")
        return {"status": "success", "message": f"تم ضبط جودة جميع القنوات ({len(channels)}) إلى {label}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/api/streaming/channels/{channel_name}/advanced", tags=["Streaming"])
def get_channel_advanced_settings(
    channel_name: str,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """الحصول على الإعدادات المتقدمة لقناة واحدة."""
    channel = db.exec(
        select(models.Channel).where(
            (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
        )
    ).first()
    if not channel:
        return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}
    return {
        "status": "success",
        "settings": {
            "dvr": channel.dvr,
            "pagetimeout": channel.pagetimeout,
            "maxkeepaway": channel.maxkeepaway,
            "inputtimeout": channel.inputtimeout,
            "always_on": channel.always_on,
            "raw": channel.raw,
        }
    }


@router.patch("/api/streaming/channels/{channel_name}/advanced", tags=["Streaming"])
def set_channel_advanced_settings(
    channel_name: str,
    body: dict,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """تعديل الإعدادات المتقدمة لقناة واحدة وإعادة إنشائها في MistServer."""
    try:
        channel = db.exec(
            select(models.Channel).where(
                (models.Channel.name == channel_name) | (models.Channel.stream_key == channel_name)
            )
        ).first()
        if not channel:
            return {"status": "error", "message": f"القناة {channel_name} غير موجودة"}

        for field in ("dvr", "pagetimeout", "maxkeepaway", "inputtimeout"):
            if field in body:
                setattr(channel, field, int(body[field]))
        for field in ("always_on", "raw"):
            if field in body:
                setattr(channel, field, bool(body[field]))

        stream_key = channel.stream_key or channel.name
        source_url = services.build_source_url_with_quality(
            channel.url, services.normalize_video_quality(channel.video_quality)
        )
        services.delete_mistserver_stream(stream_key)
        services.create_mistserver_stream(stream_key, source_url, _build_advanced_cfg(channel))
        db.add(channel)
        db.commit()
        return {"status": "success", "message": f"تم حفظ الإعدادات المتقدمة للقناة {channel.name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/streaming/channels/apply-defaults-advanced", tags=["Streaming"])
def apply_defaults_advanced(
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """تطبيق الإعدادات المتقدمة الافتراضية على جميع القنوات."""
    try:
        channels = db.exec(select(models.Channel)).all()
        if not channels:
            return {"status": "error", "message": "لا توجد قنوات"}
        for ch in channels:
            ch.dvr = 200000
            ch.pagetimeout = 90
            ch.maxkeepaway = 90000
            ch.inputtimeout = 180
            ch.always_on = False
            ch.raw = False
            stream_key = ch.stream_key or ch.name
            source_url = services.build_source_url_with_quality(
                ch.url, services.normalize_video_quality(ch.video_quality)
            )
            services.delete_mistserver_stream(stream_key)
            services.create_mistserver_stream(stream_key, source_url, _build_advanced_cfg(ch))
            db.add(ch)
        db.commit()
        return {"status": "success", "message": f"تم تطبيق الإعدادات الافتراضية على {len(channels)} قناة"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/api/streaming/channels/{channel_name}/stats", tags=["Streaming"])
def get_channel_statistics(
    channel_name: str,
    username: str = Depends(check_auth)
):
    """
    Get viewer statistics for a specific channel.
    """
    try:
        stream_result = services.get_single_stream_stats(channel_name)
        active_streams = stream_result.get("active_streams") or {} if stream_result else {}

        clients_result = services.get_stream_clients(channel_name)
        clients_data = clients_result.get("clients") or {} if clients_result else {}

        viewers = []
        if clients_data.get("data"):
            fields = clients_data.get("fields", [])
            for client_data in clients_data["data"]:
                viewer = {}
                for i, field in enumerate(fields):
                    if i < len(client_data):
                        viewer[field] = client_data[i]
                viewers.append(viewer)

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


@router.get("/api/streaming/all-stats", tags=["Streaming"])
def get_all_channels_statistics(username: str = Depends(check_auth)):
    """
    Get viewer statistics for all channels.
    """
    try:
        active_result = services.get_active_streams_stats()
        active_streams = active_result.get("active_streams") or {} if active_result else {}

        clients_result = services.get_stream_clients()
        clients_data = clients_result.get("clients") or {} if clients_result else {}

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


# ===================== Viewer Page API =====================

@router.get("/api/viewer-page/settings", response_model=models.ViewerPageSettingsRead, tags=["Viewer Page"])
def get_viewer_page_settings(db: Session = Depends(get_session), username: str = Depends(check_auth)):
    """
    Get viewer page settings.
    """
    return services.get_or_create_viewer_page_settings(db)


@router.put("/api/viewer-page/settings", response_model=models.ViewerPageSettingsRead, tags=["Viewer Page"])
def update_viewer_page_settings(
    settings_update: models.ViewerPageSettingsUpdate,
    db: Session = Depends(get_session),
    username: str = Depends(check_auth)
):
    """
    Update viewer page settings.
    """
    return services.update_viewer_page_settings(db=db, settings_data=settings_update)


@router.get("/api/viewer-page/data", tags=["Viewer Page"])
def get_viewer_page_data(db: Session = Depends(get_session)):
    """
    Get viewer page data for public access (no auth required).
    """
    return services.get_viewer_page_data(db=db)


@router.get("/api/viewer-page/stats", tags=["Viewer Page"])
def get_viewer_page_stats():
    """
    Get streaming statistics for public viewer page (no auth required).
    """
    try:
        active_result = services.get_active_streams_stats()
        active_streams = active_result.get("active_streams") or {} if active_result else {}

        simplified_stats = {}
        for stream_name, stream_stats in (active_streams.items() if isinstance(active_streams, dict) else []):
            has_input = stream_stats.get("inputs", 0) > 0
            simplified_stats[stream_name] = {
                "connections": stream_stats.get("viewers", 0),
                "inputs": stream_stats.get("inputs", 0),
                "outputs": stream_stats.get("outputs", 0),
                "status": "active" if has_input else "inactive"
            }

        return {
            "status": "success",
            "streams_stats": simplified_stats,
            "timestamp": active_result.get("timestamp", 0)
        }
    except Exception as e:
        return {"status": "error", "message": f"فشل في جلب الإحصائيات: {str(e)}"}


# ===================== Matches API (جدول مباريات اليوم) =====================

_matches_cache = {"data": None, "last_fetch": 0}


@router.get("/api/matches/today", tags=["Matches"])
def get_today_matches(db: Session = Depends(get_session)):
    """
    Get today's matches. Fetches from external API and caches for 1 hour.
    No auth required - public endpoint for viewer page.
    """
    from datetime import datetime as _datetime

    server_now = _datetime.now()
    server_time = server_now.strftime("%I:%M %p")
    server_time_24 = server_now.strftime("%H:%M")

    try:
        viewer_settings = services.get_or_create_viewer_page_settings(db)
        if not viewer_settings.show_matches_table:
            return {"status": "disabled", "matches": [], "message": "جدول المباريات معطل", "server_time": server_time, "server_time_24": server_time_24}
    except Exception:
        pass

    now = _time.time()
    cache_duration = 3600

    if _matches_cache["data"] is not None and (now - _matches_cache["last_fetch"]) < cache_duration:
        return {"status": "success", "matches": _matches_cache["data"], "cached": True, "server_time": server_time, "server_time_24": server_time_24}

    try:
        response = _requests.get(
            "http://news.zerolagvpn.com/api/matches/today/",
            timeout=15,
            headers={"Content-Type": "application/json"}
        )

        if response.ok:
            data = response.json()
            matches = data.get("matches", [])

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


# ===================== MistServer Proxy Endpoints =====================

@router.get("/mistserver/json_{stream_name}.js", tags=["MistServer Proxy"])
def get_mistserver_stream_json(stream_name: str):
    """
    Proxy endpoint to get stream JSON from MistServer.
    This solves CORS issues when frontend tries to access MistServer directly.
    """
    try:
        mistserver_url = f"http://localhost:8080/json_{stream_name}.js"
        response = _requests.get(mistserver_url, timeout=10)

        if response.ok:
            return response.json()
        else:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from MistServer")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MistServer connection error: {str(e)}")


@router.get("/mistserver/hls/{stream_name}/{file_path:path}", tags=["MistServer Proxy"])
async def proxy_hls_stream(stream_name: str, file_path: str, request: Request):
    """
    Proxy endpoint for HLS streaming files (.m3u8, .ts segments).
    This solves CORS issues when HLS.js tries to load manifests and segments.
    """
    try:
        query_string = str(request.url.query)
        mistserver_url = f"http://localhost:8080/hls/{stream_name}/{file_path}"
        if query_string:
            mistserver_url += f"?{query_string}"

        print(f"🔄 Proxying HLS request: {mistserver_url}")

        response = _requests.get(mistserver_url, timeout=30, stream=True)

        if response.ok:
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
    except _requests.exceptions.RequestException as e:
        print(f"❌ MistServer connection error: {e}")
        raise HTTPException(status_code=502, detail=f"Cannot connect to MistServer: {str(e)}")
    except Exception as e:
        print(f"❌ Proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")
