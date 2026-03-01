import os
from sqlmodel import create_engine, Session, select
from .models import SiteSettings, ViewerPageSettings, AdminUser
from .paths import PROJECT_ROOT

# مسار قاعدة البيانات:
# افتراضياً نستخدم نفس السلوك القديم: ملف database.db في المجلد الأعلى لجذر المشروع
# example:  PROJECT_ROOT=/root/Zero  →  /root/database.db
# يمكن تغيير المسار يدوياً عبر متغير البيئة DATABASE_PATH.
_default_db_path = os.path.abspath(os.path.join(PROJECT_ROOT, "..", "database.db"))
_db_path = os.environ.get("DATABASE_PATH", _default_db_path)
DATABASE_URL = "sqlite:///" + os.path.normpath(_db_path).replace("\\", "/")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def create_db_and_tables():
    from .models import SQLModel, SiteSettings, StreamingSubscription, ViewerPageSettings, AdminUser, ServiceVisit, DeliveryRequest, Notification, PushSubscription
    from passlib.context import CryptContext
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # Create all tables (preserve existing data)
    SQLModel.metadata.create_all(engine)

    # إضافة عمود description لجدول الخدمات إن لم يكن موجوداً (ترحيل تلقائي)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(service)"))
            cols = [row[1] for row in r.fetchall()]
            if "description" not in cols:
                conn.execute(text("ALTER TABLE service ADD COLUMN description VARCHAR"))
                conn.commit()
    except Exception:
        pass

    # إضافة عمود home_delivery_enabled لجدول إعدادات الموقع إن لم يكن موجوداً
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(sitesettings)"))
            cols = [row[1] for row in r.fetchall()]
            if "home_delivery_enabled" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN home_delivery_enabled BOOLEAN DEFAULT 0"))
                conn.commit()
    except Exception:
        pass

    # إضافة أعمدة status و notes لجدول طلبات التوصيل إن لم تكن موجودة
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(deliveryrequest)"))
            cols = [row[1] for row in r.fetchall()]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE deliveryrequest ADD COLUMN status VARCHAR DEFAULT 'new'"))
                conn.commit()
            if "notes" not in cols:
                conn.execute(text("ALTER TABLE deliveryrequest ADD COLUMN notes VARCHAR"))
                conn.commit()
    except Exception:
        pass

    # إضافة أعمدة النص المتحرك والأزرار المخفية لجدول إعدادات الموقع
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(sitesettings)"))
            cols = [row[1] for row in r.fetchall()]
            if "hidden_app_buttons" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN hidden_app_buttons VARCHAR DEFAULT '[]'"))
                conn.commit()
            if "marquee_enabled" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_enabled BOOLEAN DEFAULT 0"))
                conn.commit()
            if "marquee_text" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_text VARCHAR DEFAULT ''"))
                conn.commit()
            if "marquee_font_size" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_font_size INTEGER DEFAULT 18"))
                conn.commit()
            if "hotspot_auto_start_disabled" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN hotspot_auto_start_disabled BOOLEAN DEFAULT 0"))
                conn.commit()
    except Exception:
        pass

    # إضافة عمود is_hidden لجدول الخدمات إن لم يكن موجوداً
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(service)"))
            cols = [row[1] for row in r.fetchall()]
            if "is_hidden" not in cols:
                conn.execute(text("ALTER TABLE service ADD COLUMN is_hidden BOOLEAN DEFAULT 0"))
                conn.commit()
    except Exception:
        pass

    # إضافة عمود page_logo_url لجدول إعدادات صفحة المشاهدة
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(viewerpagesettings)"))
            cols = [row[1] for row in r.fetchall()]
            if "page_logo_url" not in cols:
                conn.execute(text("ALTER TABLE viewerpagesettings ADD COLUMN page_logo_url VARCHAR DEFAULT ''"))
                conn.commit()
    except Exception:
        pass

    # إضافة عمود video_quality لجدول القنوات (1=اعلى، 2=متوسطة، 3=منخفضة)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(channel)"))
            cols = [row[1] for row in r.fetchall()]
            if "video_quality" not in cols:
                conn.execute(text("ALTER TABLE channel ADD COLUMN video_quality INTEGER DEFAULT 2"))
                conn.commit()
    except Exception:
        pass

    # ترحيل: إعادة تعيين كلمة مرور المدير إلى القيمة الافتراضية (admin)
    # يتم لمرة واحدة فقط عبر ملف علم .admin_reset_v2
    import os as _os
    _reset_flag = _os.path.join(_os.path.dirname(_db_path), ".admin_reset_v2")
    _need_reset = not _os.path.exists(_reset_flag)

    # Ensure default settings exist
    with Session(engine) as session:
        get_or_create_settings(session)
        get_or_create_viewer_page_settings(session)
        admin = get_or_create_admin_user(session, pwd_ctx)

        if _need_reset and admin:
            admin.username = "admin"
            admin.password_hash = pwd_ctx.hash("admin")
            session.add(admin)
            session.commit()
            try:
                with open(_reset_flag, "w") as _f:
                    _f.write("done")
            except Exception:
                pass
            print("🔄 تم إعادة تعيين بيانات الدخول إلى (admin / admin)")


def get_session():
    with Session(engine) as session:
        yield session 

def get_or_create_settings(session: Session) -> SiteSettings:
    """Gets the site settings record, creating it if it doesn't exist."""
    # We use a hardcoded ID of 1 because there is only ever one settings row.
    settings = session.get(SiteSettings, 1)
    if not settings:
        print("Creating default site settings...")
        settings = SiteSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings 

def get_or_create_viewer_page_settings(session: Session) -> ViewerPageSettings:
    """Gets the viewer page settings record, creating it if it doesn't exist."""
    # We use a hardcoded ID of 1 because there is only ever one settings row.
    settings = session.get(ViewerPageSettings, 1)
    if not settings:
        print("Creating default viewer page settings...")
        settings = ViewerPageSettings(
            id=1,
            is_enabled=False,
            page_title="البث المباشر",
            page_description="شاهد القنوات المباشرة",
            header_color="#1976d2",
            background_color="#f5f5f5",
            show_channel_list=True,
            show_viewer_count=True,
            default_channel=None,
            auto_play=False,
            show_controls=True,
            # إعدادات الستريم والمشغل الجديدة
            streaming_format="hls",
            player_type="hls.js",
            quality_options="auto",
            enable_fullscreen=True,
            enable_volume_control=True,
            enable_playback_speed=False,
            show_stream_info=False,
            custom_css="",
            # إعدادات التحكم في البافر
            buffer_size=30,
            max_buffer_length=60,
            live_back_buffer_length=30
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def get_or_create_admin_user(session: Session, pwd_ctx=None) -> AdminUser:
    """الحصول على حساب المدير أو إنشاؤه بقيم افتراضية (admin / admin)."""
    from passlib.context import CryptContext
    if pwd_ctx is None:
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    admin = session.get(AdminUser, 1)
    if not admin:
        admin = AdminUser(
            id=1,
            username="admin",
            password_hash=pwd_ctx.hash("admin"),
        )
        session.add(admin)
        session.commit()
        session.refresh(admin)
    return admin