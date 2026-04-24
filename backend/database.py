import os
from sqlmodel import create_engine, Session, select
from .models import SiteSettings, ViewerPageSettings, AdminUser, DeviceIdentity
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
    from .models import SQLModel, SiteSettings, StreamingSubscription, ViewerPageSettings, AdminUser, ServiceVisit, DeliveryRequest, Notification, PushSubscription, DeviceIdentity
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
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN hidden_app_buttons VARCHAR DEFAULT '[\"التطبيقات\",\"المواقع\",\"الألعاب\",\"الموسيقى\",\"الصور\",\"الفيديو\",\"التعليم\",\"العمل\"]'"))
                conn.commit()
            if "marquee_enabled" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_enabled BOOLEAN DEFAULT 1"))
                conn.commit()
            if "marquee_text" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_text VARCHAR DEFAULT 'هنا تبدا الحكاية التي ستخلد في ذاكرتكم, استكشف عالمنا الرقمي المجاني'"))
                conn.commit()
            if "marquee_font_size" not in cols:
                conn.execute(text("ALTER TABLE sitesettings ADD COLUMN marquee_font_size INTEGER DEFAULT 35"))
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
            if "hidden_channels" not in cols:
                conn.execute(text("ALTER TABLE viewerpagesettings ADD COLUMN hidden_channels VARCHAR DEFAULT '[]'"))
                conn.commit()
    except Exception:
        pass

    # عمود video_quality: أبعاد الجودة (1280x720، 854x480، 512x288) — ترحيل من 1/2/3 إن وُجد
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(channel)"))
            cols = [row[1] for row in r.fetchall()]
            if "video_quality" not in cols:
                conn.execute(text("ALTER TABLE channel ADD COLUMN video_quality VARCHAR DEFAULT '854x480'"))
                conn.commit()
            else:
                for old, newv in (("1", "1280x720"), ("2", "854x480"), ("3", "512x288")):
                    conn.execute(
                        text("UPDATE channel SET video_quality = :newv WHERE CAST(video_quality AS TEXT) = :oldv"),
                        {"newv": newv, "oldv": old},
                    )
                conn.execute(
                    text("UPDATE channel SET video_quality = '854x480' WHERE video_quality IS NULL OR TRIM(COALESCE(CAST(video_quality AS TEXT), '')) = ''")
                )
                conn.commit()
            for col_name, col_type, col_default in [
                ("dvr", "INTEGER", "200000"),
                ("pagetimeout", "INTEGER", "180"),
                ("maxkeepaway", "INTEGER", "195000"),
                ("inputtimeout", "INTEGER", "120"),
                ("segmentsize", "INTEGER", "6000"),
                ("always_on", "BOOLEAN", "0"),
            ]:
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE channel ADD COLUMN {col_name} {col_type} DEFAULT {col_default}"))
                    conn.commit()
            if "raw" not in cols:
                conn.execute(text("ALTER TABLE channel ADD COLUMN raw VARCHAR DEFAULT ''"))
                conn.commit()
            else:
                conn.execute(text("UPDATE channel SET raw = '' WHERE raw IS NULL"))
                conn.commit()
    except Exception:
        pass

    # ترحيل: أعمدة نظام الصلاحيات المتعدد
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(adminuser)"))
            cols = [row[1] for row in r.fetchall()]
            if "role" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN role VARCHAR DEFAULT 'manager'"))
                conn.commit()
            if "parent_id" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN parent_id INTEGER"))
                conn.commit()
            if "permissions" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN permissions VARCHAR DEFAULT '{}'"))
                conn.commit()
            if "is_default" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN is_default BOOLEAN DEFAULT 0"))
                conn.commit()
            if "created_at" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN created_at VARCHAR"))
                conn.commit()
            if "is_active" not in cols:
                conn.execute(text("ALTER TABLE adminuser ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                conn.commit()
    except Exception:
        pass

    # Ensure default settings exist
    with Session(engine) as session:
        get_or_create_settings(session)
        get_or_create_viewer_page_settings(session)
        seed_default_users(session, pwd_ctx)


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
            live_back_buffer_length=30,
            hidden_channels="[]",
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def get_or_create_admin_user(session: Session, pwd_ctx=None) -> AdminUser:
    """الحصول على أول حساب مدير (توافق عكسي). يفضّل المالك ثم أي مستخدم."""
    from passlib.context import CryptContext
    if pwd_ctx is None:
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    admin = session.exec(select(AdminUser).where(AdminUser.role == "owner")).first()
    if not admin:
        admin = session.exec(select(AdminUser)).first()
    if not admin:
        import json
        from datetime import datetime
        all_perms = _build_full_permissions("write")
        admin = AdminUser(
            username="moha",
            password_hash=pwd_ctx.hash("Moha7000"),
            role="owner",
            parent_id=None,
            permissions=json.dumps(all_perms, ensure_ascii=False),
            is_default=False,
            created_at=datetime.now().isoformat(),
        )
        session.add(admin)
        session.commit()
        session.refresh(admin)
    return admin


def _build_full_permissions(permission_level: str = "write") -> dict:
    """بناء صلاحيات كاملة لكل أقسام لوحة التحكم."""
    sections = [
        "نظرة عامة", "الخدمات", "البث المباشر",
        "التطبيقات", "الإشعارات", "طلبات التوصيل", "الضبط"
    ]
    return {s: {"visible": True, "permission": permission_level} for s in sections}


def seed_default_users(session: Session, pwd_ctx=None):
    """إنشاء المالك الرئيسي والمدير الافتراضي إن لم يوجدا."""
    from passlib.context import CryptContext
    import json
    from datetime import datetime
    if pwd_ctx is None:
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    all_write = json.dumps(_build_full_permissions("write"), ensure_ascii=False)

    owner = session.exec(select(AdminUser).where(AdminUser.role == "owner")).first()
    if not owner:
        existing = session.exec(select(AdminUser)).first()
        if existing and existing.username == "moha":
            existing.role = "owner"
            existing.permissions = all_write
            existing.is_default = False
            session.add(existing)
            session.commit()
        else:
            owner = AdminUser(
                username="moha",
                password_hash=pwd_ctx.hash("Moha7000"),
                role="owner",
                parent_id=None,
                permissions=all_write,
                is_default=False,
                created_at=datetime.now().isoformat(),
            )
            session.add(owner)
            session.commit()
            session.refresh(owner)
        print("✅ تم إنشاء حساب المالك (moha)")

    owner = session.exec(select(AdminUser).where(AdminUser.role == "owner")).first()

    default_mgr = session.exec(
        select(AdminUser).where(AdminUser.is_default == True, AdminUser.role == "manager")
    ).first()
    if not default_mgr:
        existing_admin = session.exec(
            select(AdminUser).where(AdminUser.username == "admin")
        ).first()
        if existing_admin:
            existing_admin.role = "manager"
            existing_admin.parent_id = owner.id if owner else None
            existing_admin.permissions = all_write
            existing_admin.is_default = True
            if not existing_admin.created_at:
                existing_admin.created_at = datetime.now().isoformat()
            session.add(existing_admin)
            session.commit()
        else:
            default_mgr = AdminUser(
                username="admin",
                password_hash=pwd_ctx.hash("admin"),
                role="manager",
                parent_id=owner.id if owner else None,
                permissions=all_write,
                is_default=True,
                created_at=datetime.now().isoformat(),
            )
            session.add(default_mgr)
            session.commit()
        print("✅ تم إنشاء حساب المدير الافتراضي (admin)")


def get_user_by_username(session: Session, username: str) -> AdminUser:
    """البحث عن مستخدم باسم المستخدم."""
    return session.exec(select(AdminUser).where(AdminUser.username == username)).first()


def get_or_create_device_identity(session: Session) -> DeviceIdentity:
    """الحصول على سجل معرّف الجهاز أو إنشاؤه."""
    identity = session.get(DeviceIdentity, 1)
    if not identity:
        identity = DeviceIdentity(id=1)
        session.add(identity)
        session.commit()
        session.refresh(identity)
    return identity