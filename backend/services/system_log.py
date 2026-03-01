"""سجل أحداث النظام — حلقة في الذاكرة لعرض آخر الأحداث في لوحة التحكم."""
import threading
from collections import deque
from datetime import datetime
from typing import List, Optional


_MAX_ENTRIES = 200
_lock = threading.Lock()
_log: deque = deque(maxlen=_MAX_ENTRIES)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log_event(message: str, level: str = "info", source: str = "system") -> None:
    """إضافة حدث جديد إلى السجل."""
    entry = {
        "timestamp": _now(),
        "level": level,
        "source": source,
        "message": message,
    }
    with _lock:
        _log.append(entry)


def get_logs(limit: int = 100, level: Optional[str] = None) -> List[dict]:
    """جلب آخر الأحداث من السجل (الأحدث أولاً)."""
    with _lock:
        entries = list(_log)
    entries.reverse()
    if level:
        entries = [e for e in entries if e["level"] == level]
    return entries[:limit]


def clear_logs() -> int:
    """مسح جميع الأحداث وإرجاع العدد الذي تم حذفه."""
    with _lock:
        count = len(_log)
        _log.clear()
    return count
