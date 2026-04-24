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
UPDATE_BRANCH = "main"

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


def _normalize_version(version_str: str) -> str:
    return re.sub(r'^[vV]', '', (version_str or '').strip())


def _is_newer(remote_version: str, local_version: str) -> bool:
    return _parse_version(remote_version) > _parse_version(local_version)


def _get_local_head() -> str:
    ok, out = _run_cmd(["git", "rev-parse", "HEAD"])
    if not ok:
        return ""
    return out.strip().splitlines()[-1]


def _get_remote_main_head() -> str:
    ok, out = _run_cmd(["git", "ls-remote", "--heads", "origin", UPDATE_BRANCH])
    if not ok:
        return ""
    first = out.strip().splitlines()
    if not first:
        return ""
    return first[0].split()[0]


def check_for_updates() -> dict:
    """فحص وجود تحديث وفق ما سيتم تثبيته فعلياً من origin/main."""
    import requests

    current = get_current_version()
    _run_cmd(["git", "fetch", "origin", UPDATE_BRANCH])
    local_head = _get_local_head()
    remote_head = _get_remote_main_head()
    has_branch_update = bool(local_head and remote_head and local_head != remote_head)
    latest_on_main = current
    ok_main_version, out_main_version = _run_cmd(["git", "show", f"origin/{UPDATE_BRANCH}:VERSION"])
    if ok_main_version and out_main_version.strip():
        latest_on_main = _normalize_version(out_main_version.splitlines()[-1])

    release_payload = {}
    try:
        resp = requests.get(
            GITHUB_API_URL,
            timeout=15,
            headers={"Accept": "application/vnd.github.v3+json"}
        )
        if resp.ok:
            release_payload = resp.json()
    except Exception:
        release_payload = {}

    latest_tag = release_payload.get("tag_name", "")
    release_name = release_payload.get("name", latest_tag)
    release_body = release_payload.get("body", "")
    published_at = release_payload.get("published_at", "")
    has_version_update = _is_newer(latest_on_main, current)
    has_update = has_version_update or has_branch_update

    result = {
        "has_update": has_update,
        "current_version": current,
        "latest_version": latest_on_main,
        "latest_release_version": latest_tag,
        "update_source": f"origin/{UPDATE_BRANCH}",
        "release_name": release_name,
        "release_notes": release_body,
        "published_at": published_at,
        "download_url": release_payload.get("html_url", ""),
        "local_commit": local_head,
        "remote_commit": remote_head,
        "has_branch_update": has_branch_update,
    }
    if not release_payload:
        result["message"] = "تعذر جلب تفاصيل آخر إصدار من GitHub، لكن تم فحص origin/main بنجاح"
    return result


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

    ok, out = _run_cmd(["git", "restore", f"--source=origin/{UPDATE_BRANCH}", "--staged", "--worktree", "--", rel_path])
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
        old_version = _normalize_version(_read_version_file())
        old_head = _get_local_head()

        _set_state("updating", 5, "جاري جلب التحديثات من ...", "git_fetch")

        ok, out = _run_cmd(["git", "fetch", "origin", UPDATE_BRANCH])
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

        ok, out = _run_cmd(["git", "pull", "--ff-only", "origin", UPDATE_BRANCH])
        if not ok:
            _set_state("error", 15, f"فشل في تنزيل الملفات: {out}", error=out)
            log_event(f"فشل تحديث النظام (git pull): {out}", "error", "updater")
            return

        new_head = _get_local_head()
        if old_head and new_head and old_head == new_head:
            _set_state("error", 18, "لم يتم تطبيق أي تعديلات جديدة من الفرع الرئيسي", error="No new commit pulled")
            log_event("فشل التحديث: لم يتغير commit بعد git pull", "error", "updater")
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

        _set_state("updating", 88, "التحقق من الإصدار المطبق...", "done")
        new_version = _normalize_version(_read_version_file())

        if old_version and new_version and _parse_version(new_version) <= _parse_version(old_version):
            error_msg = (
                f"اكتملت العملية لكن الإصدار لم يرتفع (الحالي: {old_version}, بعد التحديث: {new_version}). "
                "يرجى التحقق من ملف VERSION على origin/main."
            )
            _set_state("error", 88, error_msg, error=error_msg)
            log_event(error_msg, "error", "updater")
            return

        if target_version and _parse_version(new_version) < _parse_version(target_version):
            error_msg = (
                f"الإصدار المطبق ({new_version}) أقل من الإصدار المستهدف ({target_version}). "
                "تم إيقاف إعلان النجاح لمنع حالة غير متسقة."
            )
            _set_state("error", 89, error_msg, error=error_msg)
            log_event(error_msg, "error", "updater")
            return

        _set_state("updating", 92, "جاري إعادة تشغيل خدمة النظام...", "restart")
        ok_restart, out_restart = _run_systemctl(["restart", "zero"], timeout=120)
        if not ok_restart:
            _set_state("error", 92, f"فشل إعادة تشغيل خدمة zero: {out_restart}", error=out_restart)
            log_event(f"فشل restart لخدمة zero: {out_restart}", "error", "updater")
            return

        ok_active, out_active = _run_systemctl(["is-active", "zero"], timeout=30)
        if not ok_active or "active" not in (out_active or "").strip():
            error_msg = f"تم تنفيذ restart لكن الخدمة ليست بحالة active: {out_active}"
            _set_state("error", 95, error_msg, error=error_msg)
            log_event(error_msg, "error", "updater")
            return

        _set_state("updating", 98, f"تم التحديث إلى الإصدار {new_version}", "complete")
        with _update_lock:
            _update_state["new_version"] = new_version
        _set_state("success", 100, f"تم التحديث بنجاح إلى الإصدار {new_version}", "complete")
        log_event(f"تم تثبيت النسخة الجديدة ({new_version}) بنجاح", "success", "updater")

    except Exception as e:
        _set_state("error", 0, f"خطأ غير متوقع: {str(e)}", error=str(e))
        log_event(f"خطأ في تحديث النظام: {e}", "error", "updater")


def start_update(target_version: str = "") -> dict:
    """بدء عملية التحديث في خيط خلفي."""
    with _update_lock:
        if _update_state["status"] == "updating":
            return {
                "status": "already_running",
                "message": "عملية تحديث جارية بالفعل",
                "current_status": dict(_update_state),
            }
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
    return {"status": "started", "message": "تم بدء عملية التحديث", "current_status": get_update_status()}
