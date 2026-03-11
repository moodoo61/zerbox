"""اتصال وإدارة MistServer (سيرفر البث المحلي)."""
import re
import json
import time
import subprocess
import requests

MISTSERVER_HOST = "localhost"
MISTSERVER_PORT = 4242
MISTSERVER_USERNAME = "admin"
MISTSERVER_PASSWORD = "admin"
MISTSERVER_API_URL = f"http://{MISTSERVER_HOST}:{MISTSERVER_PORT}/api"


def restart_mistserver(wait_seconds: int = 5) -> dict:
    """إعادة تشغيل خدمة MistServer عبر systemd ثم انتظار بضع ثوانٍ لاستقرارها."""
    try:
        r = subprocess.run(
            ["systemctl", "restart", "mistserver"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode != 0:
            return {
                "status": "error",
                "message": f"فشل systemctl restart: {r.stderr or r.stdout or 'unknown'}"
            }
        time.sleep(wait_seconds)
        return {"status": "success", "message": "تم إعادة تشغيل MistServer"}
    except FileNotFoundError:
        return {"status": "error", "message": "systemctl غير متوفر"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "انتهت مهلة إعادة تشغيل MistServer"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def check_mistserver_connection() -> dict:
    """فحص اتصال MistServer وإرجاع النتيجة."""
    try:
        auth_command = {
            "authorize": {
                "username": MISTSERVER_USERNAME,
                "password": MISTSERVER_PASSWORD
            }
        }
        auth_response = requests.get(
            MISTSERVER_API_URL,
            params={"command": json.dumps(auth_command)},
            timeout=5
        )
        if auth_response.ok:
            return {"status": "success", "message": "سيرفر المشاهدة متصل ويعمل بشكل طبيعي"}
        return {"status": "error", "message": "سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني"}
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        return {"status": "error", "message": "سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني"}
    except Exception:
        return {"status": "error", "message": "سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني"}


def call_mistserver_api(command_data: dict) -> dict:
    """Call MistServer API with authentication."""
    try:
        auth_command = {
            "authorize": {
                "username": MISTSERVER_USERNAME,
                "password": MISTSERVER_PASSWORD
            }
        }
        auth_response = requests.get(
            MISTSERVER_API_URL,
            params={"command": json.dumps(auth_command)},
            timeout=10
        )
        if not auth_response.ok:
            raise Exception(f"فشل مصادقة سيرفر البث المحلي: {auth_response.status_code}")
        auth_data = auth_response.json()
        if not auth_data.get("authorize", {}).get("status") == "OK":
            raise Exception("فشل مصادقة سيرفر البث المحلي: بيانات الاعتماد غير صحيحة")
        response = requests.get(
            MISTSERVER_API_URL,
            params={"command": json.dumps(command_data)},
            timeout=10
        )
        if not response.ok:
            raise Exception(f"فشل استدعاء سيرفر البث المحلي: {response.status_code}")
        return response.json()
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        raise Exception("سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني")
    except requests.exceptions.RequestException:
        raise Exception("سيرفر المشاهدة غير مثبت، يرجى التواصل مع الدعم الفني")
    except Exception as e:
        if "سيرفر المشاهدة غير مثبت" in str(e):
            raise
        raise Exception(f"خطأ في سيرفر البث المحلي: {str(e)}")


def build_source_url_with_quality(base_url: str, quality: int) -> str:
    """إضافة معامل الجودة &video=X إلى رابط القناة. quality: 1=اعلى، 2=متوسطة، 3=منخفضة."""
    if not base_url or quality not in (1, 2, 3):
        return base_url
    url = re.sub(r"[?&]video=\d+", "", base_url)
    url = url.rstrip("?&")
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}video={quality}"


def create_mistserver_stream(stream_name: str, source_url: str, advanced: dict = None) -> dict:
    """إضافة stream إلى MistServer مع دعم الإعدادات المتقدمة.
    advanced keys: DVR, pagetimeout, maxkeepaway, inputtimeout, always_on, raw
    """
    stream_cfg = {"source": source_url, "name": stream_name}
    if advanced:
        for key in ("DVR", "pagetimeout", "maxkeepaway", "inputtimeout"):
            if key in advanced:
                stream_cfg[key] = advanced[key]
        if advanced.get("always_on"):
            stream_cfg["always_on"] = True
        if advanced.get("raw"):
            stream_cfg["raw"] = True
    command = {"addstream": {stream_name: stream_cfg}}
    result = call_mistserver_api(command)
    if result.get('streams', {}).get(stream_name):
        print(f"   ✅ تمت إضافة {stream_name} بنجاح")
    return result


def get_mistserver_streams() -> dict:
    return call_mistserver_api({"streams": True})


def delete_mistserver_stream(stream_name: str) -> dict:
    return call_mistserver_api({"deletestream": stream_name})


def nuke_mistserver_stream(stream_name: str) -> dict:
    return call_mistserver_api({"nuke_stream": stream_name})


def stop_stream_sessions(stream_name: str) -> dict:
    return call_mistserver_api({"stop_sessions": stream_name})


def get_stream_clients(stream_name: str = None) -> dict:
    command = {
        "clients": {
            "streams": [stream_name] if stream_name else [],
            "fields": ["host", "stream", "protocol", "conntime", "position", "down", "up", "downbps", "upbps"]
        }
    }
    return call_mistserver_api(command)


def get_active_streams_stats() -> dict:
    command = {
        "active_streams": {
            "fields": ["viewers", "clients", "inputs", "outputs", "views", "viewseconds", "tracks", "status"],
            "longform": True
        }
    }
    return call_mistserver_api(command)


def get_single_stream_stats(stream_name: str) -> dict:
    command = {
        "active_streams": {
            "fields": ["viewers", "clients", "inputs", "outputs", "views", "viewseconds", "tracks", "status"],
            "streams": [stream_name],
            "longform": True
        }
    }
    return call_mistserver_api(command)


def delete_all_mistserver_streams():
    try:
        streams_data = get_mistserver_streams()
        streams = streams_data.get("streams", {})
        deleted_count = 0
        errors = []
        for stream_name in streams.keys():
            try:
                delete_mistserver_stream(stream_name)
                deleted_count += 1
            except Exception as e:
                errors.append(f"{stream_name}: {str(e)}")
        return {"status": "success" if not errors else "partial", "deleted_count": deleted_count, "errors": errors}
    except Exception as e:
        return {"status": "error", "deleted_count": 0, "message": f"فشل في حذف القنوات: {str(e)}"}
