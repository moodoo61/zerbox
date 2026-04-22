"""إعدادات صفحة المشاهدة (Viewer Page)."""
import json
from sqlmodel import Session, select
from .. import models
from .streaming import get_streaming_channels, get_or_create_streaming_subscription


def _parse_hidden_channels(raw_value: str) -> set[str]:
    if not raw_value:
        return set()
    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return set()
    if not isinstance(parsed, list):
        return set()
    return {str(item).strip() for item in parsed if str(item).strip()}


def get_or_create_viewer_page_settings(db: Session) -> models.ViewerPageSettings:
    try:
        settings = db.get(models.ViewerPageSettings, 1)
        if not settings:
            settings = models.ViewerPageSettings(
                id=1, is_enabled=False, page_title="البث المباشر",
                page_description="شاهد القنوات المباشرة", header_color="#1976d2",
                background_color="#f5f5f5", show_channel_list=True, show_viewer_count=True,
                default_channel=None, auto_play=False, show_controls=True,
                streaming_format="hls", player_type="hls.js",
                buffer_size=30, max_buffer_length=60, live_back_buffer_length=30,
                hidden_channels="[]",
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)
        return settings
    except Exception as e:
        print(f"Creating ViewerPageSettings table due to error: {e}")
        from sqlmodel import SQLModel
        from ..database import engine
        SQLModel.metadata.create_all(engine)
        settings = models.ViewerPageSettings(
            id=1, is_enabled=False, page_title="البث المباشر",
            page_description="شاهد القنوات المباشرة", header_color="#1976d2",
            background_color="#f5f5f5", show_channel_list=True, show_viewer_count=True,
            default_channel=None, auto_play=False, show_controls=True,
            streaming_format="hls", player_type="hls.js",
            buffer_size=30, max_buffer_length=60, live_back_buffer_length=30,
            hidden_channels="[]",
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings


def update_viewer_page_settings(db: Session, settings_data: models.ViewerPageSettingsUpdate) -> models.ViewerPageSettings:
    settings = get_or_create_viewer_page_settings(db)
    old_is_enabled = settings.is_enabled
    settings_update_data = settings_data.dict(exclude_unset=True)
    for key, value in settings_update_data.items():
        setattr(settings, key, value)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    if 'is_enabled' in settings_update_data and settings.is_enabled != old_is_enabled:
        try:
            viewer_service = db.exec(select(models.DefaultService).where(models.DefaultService.name == "البث المباشر")).first()
            if viewer_service:
                viewer_service.is_active = settings.is_enabled
                viewer_service.is_running = settings.is_enabled
                db.add(viewer_service)
                db.commit()
        except Exception as sync_error:
            print(f"⚠️ تحذير: فشل في مزامنة خدمة البث المباشر: {sync_error}")
    return settings


def get_viewer_page_data(db: Session) -> dict:
    settings = get_or_create_viewer_page_settings(db)
    if not settings.is_enabled:
        return {"status": "disabled", "message": "صفحة المشاهدة غير مفعلة"}
    subscription = get_or_create_streaming_subscription(db)
    if not subscription.is_active:
        return {"status": "disabled", "message": "خدمة البث غير مفعلة"}
    channels = get_streaming_channels(db)
    hidden_channels = _parse_hidden_channels(getattr(settings, "hidden_channels", "[]"))
    if hidden_channels:
        channels = [
            channel for channel in channels
            if (channel.stream_key or channel.name) not in hidden_channels
        ]
    if settings.default_channel:
        if settings.default_channel in hidden_channels:
            settings.default_channel = None
        sorted_channels = []
        for channel in channels:
            if channel.name == settings.default_channel:
                sorted_channels.insert(0, channel)
            else:
                sorted_channels.append(channel)
        channels = sorted_channels
    return {"status": "enabled", "settings": settings, "channels": channels, "total_channels": len(channels)}
