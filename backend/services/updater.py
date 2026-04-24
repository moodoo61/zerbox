"""نظام التحديث التلقائي — فحص إصدارات GitHub وتنفيذ التحديث."""
import re
import threading
import subprocess
from pathlib import Path
from typing import Optional
from .system_log import log_event

GITHUB_REPO = "moodoo61/zerbox"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

_update_state = {
    "status": "idle",
    "progress": 0,
    "message": "",
    "steps": [],
    "new_version": None,
    "error": None,
}
_update_lock = threading.Lock()


def _read_version_file() -> str:
    version_file = PROJECT_ROOT / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    return "1.0.0"


def get_current_version() -> str:
    return _read_version_file()


def _parse_version(version_str: str) -> tuple:
    cleaned = re.sub(r'^[vV]', '', version_str.strip())
    parts = cleaned.split('.')
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(0)
    while len(result) < 3:
        result.append(0)
    return tuple(result[:3])


def _is_newer(remote_version: str, local_version: str) -> bool:
    return _parse_version(remote_version) > _parse_version(local_version)


def check_for_updates() -> dict:
    """فحص GitHub Releases للبحث عن إصدار أحدث."""
    import requests

    current = get_current_version()
    try:
        resp = requests.get(
            GITHUB_API_URL,
            timeout=15,
            headers={"Accept": "application/vnd.github.v3+json"}
        )
        if resp.status_code == 404:
            return {
                "has_update": False,
                "current_version": current,
                "latest_version": current,
                "message": "لا توجد إصدارات منشورة  بعد",
            }
        if not resp.ok:
            return {
                "has_update": False,
                "current_version": current,
                "error": f"فشل الاتصال بـ : {resp.status_code}",
            }
        data = resp.json()
        latest_tag = data.get("tag_name", "")
        release_name = data.get("name", latest_tag)
        release_body = data.get("body", "")
        published_at = data.get("published_at", "")
        has_update = _is_newer(latest_tag, current)

        return {
            "has_update": has_update,
            "current_version": current,
            "latest_version": latest_tag,
            "release_name": release_name,
            "release_notes": release_body,
            "published_at": published_at,
            "download_url": data.get("html_url", ""),
        }
    except Exception as e:
        return {
            "has_update": False,
            "current_version": current,
            "error": f"خطأ في فحص التحديثات: {str(e)}",
        }


def get_update_status() -> dict:
    with _update_lock:
        return dict(_update_state)


def _set_state(status: str, progress: int, message: str,
               step: Optional[str] = None, error: Optional[str] = None):
    with _update_lock:
        _update_state["status"] = status
        _update_state["progress"] = progress
        _update_state["message"] = message
        if error:
            _update_state["error"] = error
        if step:
            _update_state["steps"].append({"step": step, "message": message})


def _run_cmd(cmd: list, cwd: str = None, timeout: int = 300) -> tuple:
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=cwd or str(PROJECT_ROOT), timeout=timeout
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "انتهت مهلة التنفيذ"
    except Exception as e:
        return False, str(e)


def _run_systemctl(cmd: list, timeout: int = 90) -> tuple:
    """
    تشغيل أوامر systemctl بطريقة متوافقة:
    - مباشرة (عند عمل الخدمة بصلاحية root)
    - مع sudo كخيار احتياطي.
    """
    ok, out = _run_cmd(["systemctl"] + cmd, timeout=timeout)
    if ok:
        return True, out
    ok2, out2 = _run_cmd(["sudo", "systemctl"] + cmd, timeout=timeout)
    return ok2, (out + "\n" + out2).strip()


def _force_update_mistserver_conf() -> tuple:
    """
    نجعل mistserver.conf يطابق نسخة origin/main دائماً أثناء التحديث.
    هذا يمنع فشل git pull بسبب تعديلات محلية ناتجة عن MistServer.
    """
    rel_path = "mistserver.conf"

    tracked_ok, _ = _run_cmd(["git", "ls-files", "--error-unmatch", rel_path])
    if not tracked_ok:
        return True, "mistserver.conf غير مُتعقّب"

    # لو كان مفعّل skip-worktree سابقاً على هذا الجهاز، نعطّله حتى نستطيع تحديث الملف.
    _run_cmd(["git", "update-index", "--no-skip-worktree", rel_path])

    ok, out = _run_cmd(["git", "restore", "--source=origin/main", "--staged", "--worktree", "--", rel_path])
    if not ok:
        return False, out
    return True, "تمت مزامنة mistserver.conf مع origin/main"


def _sync_quran_service_unit() -> tuple:
    """
    مزامنة zero-quran.service تلقائياً بعد التحديث:
    - نسخ ملف الخدمة من deploy مع استبدال /root/Zero بالمسار الفعلي.
    - daemon-reload + enable + restart.
    """
    src = PROJECT_ROOT / "deploy" / "zero-quran.service"
    dst = Path("/etc/systemd/system/zero-quran.service")

    if not src.exists():
        return False, f"ملف الخدمة غير موجود: {src}"

    try:
        raw = src.read_text(encoding="utf-8")
        rendered = raw.replace("/root/Zero", str(PROJECT_ROOT))
        current = dst.read_text(encoding="utf-8") if dst.exists() else None
        if current != rendered:
            dst.write_text(rendered, encoding="utf-8")
    except Exception as e:
        return False, f"فشل تحديث ملف الخدمة: {e}"

    ok_reload, out_reload = _run_systemctl(["daemon-reload"], timeout=60)
    if not ok_reload:
        return False, f"فشل daemon-reload: {out_reload}"

    # لا نجعل enable/ restart قاتلة للتحديث الرئيسي؛ تعاد كخطأ يمكن التعامل معه.
    ok_enable, out_enable = _run_systemctl(["enable", "zero-quran"], timeout=60)
    ok_restart, out_restart = _run_systemctl(["restart", "zero-quran"], timeout=90)
    if not ok_enable or not ok_restart:
        return False, f"enable={ok_enable}, restart={ok_restart}\n{out_enable}\n{out_restart}"
    return True, "تمت مزامنة وتشغيل خدمة القرآن"


def _do_update(target_version: str):
    """تنفيذ عملية التحديث في خيط خلفي."""
    try:
        _set_state("updating", 5, "جاري جلب التحديثات من ...", "git_fetch")

        ok, out = _run_cmd(["git", "fetch", "origin"])
        if not ok:
            _set_state("error", 5, f"فشل في جلب التحديثات: {out}", error=out)
            log_event(f"فشل تحديث النظام (git fetch): {out}", "error", "updater")
            return

        _set_state("updating", 15, "جاري تنزيل الملفات الجديدة...", "git_pull")

        ok_conf, out_conf = _force_update_mistserver_conf()
        if not ok_conf:
            _set_state("error", 15, f"فشل تحديث ملف الإعداد mistserver.conf: {out_conf}", error=out_conf)
            log_event(f"فشل تحديث mistserver.conf قبل pull: {out_conf}", "error", "updater")
            return

        ok, out = _run_cmd(["git", "pull", "origin", "main"])
        if not ok:
            _set_state("error", 15, f"فشل في تنزيل الملفات: {out}", error=out)
            log_event(f"فشل تحديث النظام (git pull): {out}", "error", "updater")
            return

        _set_state("updating", 30, "جاري تثبيت مكتبات Python...", "pip_install")

        ok, out = _run_cmd(
            ["pip3", "install", "-r", "backend/requirements.txt"],
            timeout=120
        )
        if not ok:
            _set_state("updating", 35, "تحذير: فشل تثبيت بعض مكتبات Python", "pip_warning")

        _set_state("updating", 45, "جاري تثبيت حزم الواجهة الأمامية...", "npm_install")

        frontend_dir = str(PROJECT_ROOT / "frontend")
        ok, out = _run_cmd(["npm", "install"], cwd=frontend_dir, timeout=180)
        if not ok:
            _set_state("error", 45, f"فشل في تثبيت حزم الواجهة: {out}", error=out)
            log_event(f"فشل تحديث النظام (npm install): {out}", "error", "updater")
            return

        _set_state("updating", 60, "جاري بناء الواجهة الأمامية...", "npm_build")

        ok, out = _run_cmd(["npm", "run", "build"], cwd=frontend_dir, timeout=300)
        if not ok:
            _set_state("error", 60, f"فشل في بناء الواجهة: {out}", error=out)
            log_event(f"فشل تحديث النظام (npm build): {out}", "error", "updater")
            return

        quran_dir = str(PROJECT_ROOT / "quran")
        if Path(quran_dir, "package.json").exists():
            _set_state("updating", 72, "جاري تجهيز تطبيق القرآن الكريم...", "quran_prepare")
            ok, out = _run_cmd(["npm", "install"], cwd=quran_dir, timeout=240)
            if not ok:
                _set_state(
                    "updating",
                    75,
                    "تحذير: تعذر تجهيز مكتبات القرآن الكريم تلقائياً",
                    "quran_warning",
                )
                log_event(f"تحذير تجهيز القرآن (npm install): {out}", "warning", "updater")
            else:
                _set_state("updating", 78, "جاري تحديث خدمة القرآن الكريم...", "quran_service")
                ok_sync, out_sync = _sync_quran_service_unit()
                if not ok_sync:
                    _set_state(
                        "updating",
                        80,
                        "تحذير: تعذر إعادة تهيئة خدمة القرآن تلقائياً",
                        "quran_service_warning",
                    )
                    log_event(f"تحذير مزامنة خدمة القرآن: {out_sync}", "warning", "updater")

        _set_state("updating", 90, "جاري إعادة تشغيل النظام...", "restart")

        new_version = _read_version_file()
        _set_state("updating", 95, f"تم التحديث إلى الإصدار {new_version}", "done")

        log_event(
            f"تم تثبيت النسخة الجديدة ({new_version}) بنجاح",
            "success", "updater"
        )

        _set_state("success", 100,
                   f"تم التحديث بنجاح إلى الإصدار {new_version}. جاري إعادة التشغيل...",
                   "complete")

        with _update_lock:
            _update_state["new_version"] = new_version

        try:
            subprocess.Popen(
                ["sudo", "systemctl", "restart", "zero"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except Exception:
            _set_state("success", 100,
                       f"تم التحديث بنجاح. يرجى إعادة تشغيل الخدمة يدوياً: sudo systemctl restart zero")

    except Exception as e:
        _set_state("error", 0, f"خطأ غير متوقع: {str(e)}", error=str(e))
        log_event(f"خطأ في تحديث النظام: {e}", "error", "updater")


def start_update(target_version: str = "") -> dict:
    """بدء عملية التحديث في خيط خلفي."""
    with _update_lock:
        if _update_state["status"] == "updating":
            return {"status": "error", "message": "عملية تحديث جارية بالفعل"}
        _update_state.update({
            "status": "updating",
            "progress": 0,
            "message": "جاري بدء التحديث...",
            "steps": [],
            "new_version": None,
            "error": None,
        })

    log_event("بدء عملية تحديث النظام...", "info", "updater")
    thread = threading.Thread(target=_do_update, args=(target_version,), daemon=True)
    thread.start()
    return {"status": "started", "message": "تم بدء عملية التحديث"}
