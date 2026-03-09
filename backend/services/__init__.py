"""
حزمة الخدمات — إعادة تصدير كل الدوال للتوافق مع الاستخدام الحالي:
    from backend import services
    services.get_system_stats()
"""

# إحصائيات النظام ومعرّف الجهاز
from .system_stats import get_system_stats, get_device_id, get_machine_identity

# عمليات CRUD للخدمات المخصصة
from .crud import (
    create_service,
    get_services,
    get_service,
    update_service,
    delete_service,
    increment_click_count,
)

# MistServer
from .mistserver import (
    build_source_url_with_quality,
    restart_mistserver,
    check_mistserver_connection,
    call_mistserver_api,
    create_mistserver_stream,
    get_mistserver_streams,
    delete_mistserver_stream,
    nuke_mistserver_stream,
    stop_stream_sessions,
    get_stream_clients,
    get_active_streams_stats,
    get_single_stream_stats,
    delete_all_mistserver_streams,
    MISTSERVER_HOST,
    MISTSERVER_PORT,
    MISTSERVER_USERNAME,
    MISTSERVER_PASSWORD,
    MISTSERVER_API_URL,
)

# البث والقنوات
from .streaming import (
    get_or_create_streaming_subscription,
    generate_key_from_server,
    save_key_to_file,
    refresh_key_on_startup,
    read_local_key,
    verify_key_and_fetch_channels,
    activate_streaming_service,
    get_streaming_channels,
    add_test_channel,
    sync_channels_from_mistserver,
    sync_channels_from_external_server,
)

# صفحة المشاهدة
from .viewer import (
    get_or_create_viewer_page_settings,
    update_viewer_page_settings,
    get_viewer_page_data,
)

# الإشعارات
from .notifications import (
    get_or_generate_vapid_keys,
    get_vapid_public_key,
    create_notification,
    get_notifications,
    get_notification,
    delete_notification,
    get_public_notifications,
    subscribe_push,
    unsubscribe_push,
    get_subscribers_count,
    send_notification_to_all,
    send_scheduled_notifications,
)

# سجل أحداث النظام
from .system_log import log_event, get_logs, clear_logs

# نظام التحديث
from .updater import (
    get_current_version,
    check_for_updates,
    get_update_status,
    start_update,
)

# الخدمات الافتراضية
from .default_services import (
    get_server_ip,
    initialize_default_services,
    get_default_services,
    get_default_service,
    update_default_service,
    start_default_service,
    stop_default_service,
    restart_default_service,
    toggle_default_service,
    check_service_status,
)
