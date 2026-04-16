import json
import os
import threading
import time
from typing import Dict, List, Any
from urllib.request import urlopen, Request

from ..paths import PROJECT_ROOT


QURAN_ROOT = os.path.join(PROJECT_ROOT, "quran")
AUDIO_JSON_DIR = os.path.join(QURAN_ROOT, "data", "json", "audio")
AUDIO_STORAGE_DIR = os.path.join(QURAN_ROOT, "data", "audio")
SETTINGS_FILE = os.path.join(QURAN_ROOT, "data", "quran_local_settings.json")
_pause_event = threading.Event()
_stop_event = threading.Event()

_state_lock = threading.Lock()
_download_state: Dict[str, Any] = {
    "status": "idle",
    "progress": 0,
    "message": "",
    "selected_reciter_ids": [],
    "current_surah": None,
    "current_reciter_id": None,
    "total_targets": 0,
    "processed_targets": 0,
    "downloaded_files": 0,
    "skipped_files": 0,
    "failed_files": 0,
    "last_error": None,
    "updated_at": None,
}


def _default_settings() -> Dict[str, Any]:
    return {
        "audio_mode": "local",
        "selected_reciter_ids": [],
        "updated_at": int(time.time()),
    }


def _read_settings() -> Dict[str, Any]:
    if not os.path.exists(SETTINGS_FILE):
        return _default_settings()
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        merged = _default_settings()
        merged.update(data if isinstance(data, dict) else {})
        merged["audio_mode"] = "local"
        if not isinstance(merged.get("selected_reciter_ids"), list):
            merged["selected_reciter_ids"] = []
        return merged
    except Exception:
        return _default_settings()


def _write_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    payload = _default_settings()
    payload.update(settings or {})
    payload["audio_mode"] = "local"
    payload["updated_at"] = int(time.time())
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def _audio_json_path(surah_id: int) -> str:
    return os.path.join(AUDIO_JSON_DIR, f"audio_surah_{surah_id}.json")


def _target_audio_file(surah_id: int, reciter_id: int) -> str:
    filename = f"reciter_{reciter_id}_{str(surah_id).zfill(3)}.mp3"
    return os.path.join(AUDIO_STORAGE_DIR, f"surah_{surah_id}", filename)


def _target_audio_link(surah_id: int, reciter_id: int) -> str:
    filename = f"reciter_{reciter_id}_{str(surah_id).zfill(3)}.mp3"
    return f"/data/audio/surah_{surah_id}/{filename}"


def _load_audio_json(surah_id: int) -> List[Dict[str, Any]]:
    p = _audio_json_path(surah_id)
    if not os.path.exists(p):
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_audio_json(surah_id: int, data: List[Dict[str, Any]]) -> None:
    p = _audio_json_path(surah_id)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _pick_remote_link(entry: Dict[str, Any], surah_id: int) -> str:
    candidates = [entry.get("originalLink"), entry.get("link")]
    for c in candidates:
        if isinstance(c, str) and c.startswith(("http://", "https://")):
            return c
    # بعض الملفات السابقة تحفظ originalLink بشكل محلي؛ نبني الرابط من server عند الحاجة.
    server = entry.get("server")
    if isinstance(server, str) and server.startswith(("http://", "https://")):
        return server.rstrip("/") + "/" + str(surah_id).zfill(3) + ".mp3"
    return ""


def _download_file(url: str, file_path: str) -> None:
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    req = Request(url, headers={"User-Agent": "Zero-Quran-Downloader/1.0"})
    tmp = file_path + ".part"
    with urlopen(req, timeout=30) as resp, open(tmp, "wb") as out:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            out.write(chunk)
    os.replace(tmp, file_path)


def get_reciters() -> List[Dict[str, Any]]:
    data = _load_audio_json(1)
    result = []
    for item in data:
        rid = item.get("id")
        if not isinstance(rid, int):
            continue
        reciter = item.get("reciter") or {}
        result.append({
            "id": rid,
            "name_ar": reciter.get("ar", f"قارئ {rid}"),
            "name_en": reciter.get("en", ""),
        })
    return result


def _is_reciter_fully_downloaded(reciter_id: int) -> bool:
    for surah_id in range(1, 115):
        if not os.path.exists(_target_audio_file(surah_id, reciter_id)):
            return False
    return True


def get_reciters_with_status() -> List[Dict[str, Any]]:
    reciters = get_reciters()
    out = []
    for r in reciters:
        rid = r["id"]
        out.append({
            **r,
            "is_downloaded": _is_reciter_fully_downloaded(rid),
        })
    return out


def get_download_state() -> Dict[str, Any]:
    with _state_lock:
        return dict(_download_state)


def get_settings_payload() -> Dict[str, Any]:
    settings = _read_settings()
    reciters = get_reciters_with_status()
    downloaded = [r for r in reciters if r["is_downloaded"]]
    pending = [r for r in reciters if not r["is_downloaded"]]
    return {
        "audio_mode": "local",
        "storage_path": AUDIO_STORAGE_DIR,
        "selected_reciter_ids": settings.get("selected_reciter_ids", []),
        "reciters": reciters,
        "downloaded_reciters": downloaded,
        "pending_reciters": pending,
        "download_state": get_download_state(),
    }


def save_selected_reciters(reciter_ids: List[int]) -> Dict[str, Any]:
    ids = sorted({int(x) for x in reciter_ids if str(x).isdigit()})
    settings = _read_settings()
    settings["selected_reciter_ids"] = ids
    _write_settings(settings)
    return get_settings_payload()


def _set_state(**kwargs) -> None:
    with _state_lock:
        _download_state.update(kwargs)
        _download_state["updated_at"] = int(time.time())


def _download_worker(reciter_ids: List[int]) -> None:
    try:
        targets = []
        for rid in reciter_ids:
            for surah_id in range(1, 115):
                targets.append((rid, surah_id))
        total = len(targets)
        _set_state(
            status="downloading",
            progress=0,
            message="بدء تنزيل الملفات الصوتية...",
            selected_reciter_ids=reciter_ids,
            current_surah=None,
            current_reciter_id=None,
            total_targets=total,
            processed_targets=0,
            downloaded_files=0,
            skipped_files=0,
            failed_files=0,
            last_error=None,
        )

        downloaded_files = 0
        skipped_files = 0
        failed_files = 0
        processed = 0

        for rid, surah_id in targets:
            if _stop_event.is_set():
                _set_state(
                    status="stopped",
                    message=(
                        "تم إيقاف التنزيل بواسطة المستخدم. "
                        f"(المنجز: {processed} / {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
                    ),
                    progress=int((processed / total) * 100) if total else 0,
                    current_surah=None,
                    current_reciter_id=None,
                )
                return

            while _pause_event.is_set():
                if _stop_event.is_set():
                    _set_state(
                        status="stopped",
                        message=(
                            "تم إيقاف التنزيل بواسطة المستخدم. "
                            f"(المنجز: {processed} / {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
                        ),
                        progress=int((processed / total) * 100) if total else 0,
                        current_surah=None,
                        current_reciter_id=None,
                    )
                    return
                _set_state(
                    status="paused",
                    message=(
                        "التنزيل متوقف مؤقتاً. "
                        f"(المنجز: {processed} / {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
                    ),
                )
                time.sleep(0.4)

            if get_download_state().get("status") != "downloading":
                _set_state(status="downloading", message="تم استئناف التنزيل...")

            _set_state(
                current_surah=surah_id,
                current_reciter_id=rid,
                message=f"تنزيل القارئ {rid} - سورة {surah_id}",
            )
            file_path = _target_audio_file(surah_id, rid)
            rel_link = _target_audio_link(surah_id, rid)

            entries = _load_audio_json(surah_id)
            entry = next((x for x in entries if x.get("id") == rid), None)

            if os.path.exists(file_path):
                skipped_files += 1
                if entry and entry.get("link") != rel_link:
                    entry["link"] = rel_link
                    _save_audio_json(surah_id, entries)
            else:
                remote_url = _pick_remote_link(entry or {}, surah_id)
                if not remote_url:
                    failed_files += 1
                else:
                    try:
                        _download_file(remote_url, file_path)
                        downloaded_files += 1
                        if entry:
                            entry["originalLink"] = remote_url
                            entry["link"] = rel_link
                            _save_audio_json(surah_id, entries)
                    except Exception as e:
                        failed_files += 1
                        _set_state(last_error=str(e))

            processed += 1
            progress = int((processed / total) * 100) if total else 100
            _set_state(
                progress=progress,
                processed_targets=processed,
                downloaded_files=downloaded_files,
                skipped_files=skipped_files,
                failed_files=failed_files,
            )

        if downloaded_files == 0 and skipped_files == 0 and failed_files > 0:
            final_status = "error"
            final_message = (
                "فشل تنزيل جميع الملفات المحددة. "
                f"(المجموع: {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
            )
        elif failed_files == 0:
            final_status = "success"
            final_message = (
                "اكتملت عملية تنزيل القراء المحددين بنجاح. "
                f"(المجموع: {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
            )
        else:
            final_status = "partial_success"
            final_message = (
                "اكتمل التنزيل جزئياً: بعض الملفات فشلت. "
                f"(المجموع: {total} | تم تنزيله: {downloaded_files} | موجود مسبقاً: {skipped_files} | فشل: {failed_files})"
            )
        _set_state(
            status=final_status,
            progress=100,
            message=final_message,
            current_surah=None,
            current_reciter_id=None,
        )
    except Exception as e:
        _set_state(status="error", message=f"فشل تنزيل الملفات: {e}", last_error=str(e))


def start_download(reciter_ids: List[int]) -> Dict[str, Any]:
    if not reciter_ids:
        settings = _read_settings()
        reciter_ids = [int(x) for x in settings.get("selected_reciter_ids", []) if str(x).isdigit()]
    reciter_ids = sorted(set(reciter_ids))
    if not reciter_ids:
        return {"status": "error", "message": "لم يتم تحديد أي قارئ للتنزيل"}

    current = get_download_state()
    if current.get("status") in ("downloading", "paused"):
        return {"status": "warning", "message": "عملية تنزيل جارية بالفعل", "download_state": current}

    save_selected_reciters(reciter_ids)
    _pause_event.clear()
    _stop_event.clear()
    worker = threading.Thread(target=_download_worker, args=(reciter_ids,), daemon=True)
    worker.start()
    return {"status": "started", "message": "تم بدء تنزيل الملفات الصوتية", "download_state": get_download_state()}


def pause_download() -> Dict[str, Any]:
    current = get_download_state()
    if current.get("status") != "downloading":
        return {"status": "warning", "message": "لا توجد عملية تنزيل نشطة لإيقافها مؤقتاً", "download_state": current}
    _pause_event.set()
    _set_state(status="paused", message="تم إرسال طلب الإيقاف المؤقت...")
    return {"status": "success", "message": "تم إيقاف التنزيل مؤقتاً", "download_state": get_download_state()}


def resume_download() -> Dict[str, Any]:
    current = get_download_state()
    if current.get("status") != "paused":
        return {"status": "warning", "message": "لا توجد عملية تنزيل متوقفة مؤقتاً", "download_state": current}
    _pause_event.clear()
    _set_state(status="downloading", message="تم استئناف التنزيل...")
    return {"status": "success", "message": "تم استئناف التنزيل", "download_state": get_download_state()}


def stop_download() -> Dict[str, Any]:
    current = get_download_state()
    if current.get("status") not in ("downloading", "paused"):
        return {"status": "warning", "message": "لا توجد عملية تنزيل لإيقافها", "download_state": current}
    _pause_event.clear()
    _stop_event.set()
    _set_state(status="stopping", message="جارٍ إيقاف التنزيل...")
    return {"status": "success", "message": "تم إرسال طلب إيقاف التنزيل", "download_state": get_download_state()}

