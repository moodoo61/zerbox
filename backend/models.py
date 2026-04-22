from typing import Optional, List
from sqlmodel import Field, SQLModel


class ServiceBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None  # وصف الخدمة للعرض في الواجهة الأمامية
    link: str
    image_url: str
    click_count: int = 0
    is_hidden: bool = False  # إخفاء الخدمة من الواجهة الأمامية


class Service(ServiceBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class ServiceCreate(ServiceBase):
    pass


class ServiceRead(ServiceBase):
    id: int


class ServiceUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None
    image_url: Optional[str] = None
    click_count: Optional[int] = None
    is_hidden: Optional[bool] = None


# ---- Device Identity (معرّف الجهاز المخصص) ----

class DeviceIdentity(SQLModel, table=True):
    """تخزين معرّف مخصص للجهاز (SN و UUID) بدلاً من قيم النظام."""
    id: int = Field(default=1, primary_key=True)
    custom_serial: Optional[str] = None
    custom_uuid: Optional[str] = None


class DeviceIdentityRead(SQLModel):
    custom_serial: Optional[str] = None
    custom_uuid: Optional[str] = None
    system_serial: Optional[str] = None
    system_uuid: Optional[str] = None
    active_serial: Optional[str] = None
    active_uuid: Optional[str] = None


class DeviceIdentityUpdate(SQLModel):
    custom_serial: Optional[str] = None
    custom_uuid: Optional[str] = None


# ---- New Site Settings Models ----

class SiteSettingsBase(SQLModel):
    welcome_message: str = "مرحبًا بكم في المنصة الترفيهية والخدمية"
    logo_url: Optional[str] = None
    header_color: str = "#1976d2"
    welcome_font_size: int = 48
    welcome_font_color: str = "#FFFFFF"
    header_background_type: str = "color" # 'color' or 'image'
    header_background_image_url: Optional[str] = None
    header_color_opacity: float = 1.0 # 0.0 to 1.0
    home_delivery_enabled: bool = False  # تفعيل/تعطيل ميزة طلب التوصيل للمنزل
    hidden_app_buttons: str = '["التطبيقات","المواقع","الألعاب","الموسيقى","الصور","الفيديو","التعليم","العمل"]'  # JSON: افتراضي إخفاء الجميع
    marquee_enabled: bool = True  # تفعيل النص المتحرك (افتراضي مفعل)
    marquee_text: str = "هنا تبدا الحكاية التي ستخلد في ذاكرتكم, استكشف عالمنا الرقمي المجاني"  # النص المتحرك
    marquee_font_size: int = 35  # حجم خط النص المتحرك
    hotspot_auto_start_disabled: bool = False  # إن كان True فلا نفعّل الهوتسبوت تلقائياً عند بدء التشغيل (تعطيل من المستخدم)


class SiteSettings(SiteSettingsBase, table=True):
    id: int = Field(default=1, primary_key=True)


class SiteSettingsRead(SiteSettingsBase):
    pass


class SiteSettingsUpdate(SQLModel):
    welcome_message: Optional[str] = None
    logo_url: Optional[str] = None
    header_color: Optional[str] = None
    welcome_font_size: Optional[int] = None
    welcome_font_color: Optional[str] = None
    header_background_type: Optional[str] = None
    header_background_image_url: Optional[str] = None
    header_color_opacity: Optional[float] = None
    home_delivery_enabled: Optional[bool] = None
    hidden_app_buttons: Optional[str] = None
    marquee_enabled: Optional[bool] = None
    marquee_text: Optional[str] = None
    marquee_font_size: Optional[int] = None
    hotspot_auto_start_disabled: Optional[bool] = None


# ---- Streaming Models ----

class StreamingSubscriptionBase(SQLModel):
    subscription_data: str
    is_active: bool = False
    external_server_url: Optional[str] = None
    activation_date: Optional[str] = None
    last_sync_date: Optional[str] = None


class StreamingSubscription(StreamingSubscriptionBase, table=True):
    id: int = Field(default=1, primary_key=True)


class StreamingSubscriptionRead(StreamingSubscriptionBase):
    id: int


class StreamingSubscriptionCreate(SQLModel):
    subscription_data: str


class StreamingSubscriptionUpdate(SQLModel):
    subscription_data: Optional[str] = None
    is_active: Optional[bool] = None
    external_server_url: Optional[str] = None
    activation_date: Optional[str] = None
    last_sync_date: Optional[str] = None


class ChannelBase(SQLModel):
    name: str
    url: str
    # توافق مع قواعد SQLite القديمة (عمود NOT NULL). لم يعد يُستخدم وظيفياً.
    raw: str = ""
    category: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0
    stream_key: Optional[str] = None  # اسم القناة في MistServer (ch11, ch12, etc.)
    video_quality: str = "854x480"  # 1280x720 | 854x480 | 512x288 → video=<أبعاد> في رابط المصدر
    dvr: int = 200000  # Buffer time (ms)
    pagetimeout: int = 180  # Memory page timeout
    maxkeepaway: int = 195000  # Maximum live keep-away distance
    inputtimeout: int = 120  # Input inactivity timeout
    segmentsize: int = 6000  # حجم المقطع (ms)
    always_on: bool = False  # تشغيل دائم


class Channel(ChannelBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class ChannelRead(ChannelBase):
    id: int


class ChannelCreate(ChannelBase):
    pass


class ChannelUpdate(SQLModel):
    name: Optional[str] = None
    url: Optional[str] = None
    raw: Optional[str] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    stream_key: Optional[str] = None
    video_quality: Optional[str] = None
    dvr: Optional[int] = None
    pagetimeout: Optional[int] = None
    maxkeepaway: Optional[int] = None
    inputtimeout: Optional[int] = None
    segmentsize: Optional[int] = None
    always_on: Optional[bool] = None


# ---- Viewer Page Settings Models ----

class ViewerPageSettingsBase(SQLModel):
    is_enabled: bool = False
    page_title: str = "البث المباشر"
    page_description: str = "شاهد القنوات المباشرة"
    page_logo_url: str = ""
    header_color: str = "#1976d2"
    background_color: str = "#f5f5f5"
    show_channel_list: bool = True
    show_viewer_count: bool = True
    default_channel: Optional[str] = None
    auto_play: bool = False
    show_controls: bool = True
    
    # إعدادات الستريم والمشغل الجديدة
    streaming_format: str = "hls"  # hls, flv, mp4
    player_type: str = "hls.js"  # hls.js, flv.js, html5
    quality_options: str = "auto"  # auto (ميزة قادمة)
    enable_fullscreen: bool = True
    enable_volume_control: bool = True
    enable_playback_speed: bool = False
    show_stream_info: bool = False
    custom_css: str = ""
    
    # إعدادات التحكم في البافر
    buffer_size: int = 30  # حجم البافر بالثواني
    max_buffer_length: int = 60  # الحد الأقصى للبافر بالثواني
    live_back_buffer_length: int = 30  # البافر الخلفي للبث المباشر بالثواني
    
    # إعدادات جدول المباريات
    show_matches_table: bool = False  # تفعيل/تعطيل جدول مباريات اليوم
    hidden_channels: str = "[]"  # JSON array of stream_key/name values hidden from viewer page


class ViewerPageSettings(ViewerPageSettingsBase, table=True):
    id: int = Field(default=1, primary_key=True)


class ViewerPageSettingsRead(ViewerPageSettingsBase):
    id: int


class ViewerPageSettingsUpdate(SQLModel):
    is_enabled: Optional[bool] = None
    page_title: Optional[str] = None
    page_description: Optional[str] = None
    page_logo_url: Optional[str] = None
    header_color: Optional[str] = None
    background_color: Optional[str] = None
    show_channel_list: Optional[bool] = None
    show_viewer_count: Optional[bool] = None
    default_channel: Optional[str] = None
    auto_play: Optional[bool] = None
    show_controls: Optional[bool] = None
    
    # إعدادات الستريم والمشغل الجديدة
    streaming_format: Optional[str] = None
    player_type: Optional[str] = None
    quality_options: Optional[str] = None
    enable_fullscreen: Optional[bool] = None
    enable_volume_control: Optional[bool] = None
    enable_playback_speed: Optional[bool] = None
    show_stream_info: Optional[bool] = None
    custom_css: Optional[str] = None
    
    # إعدادات التحكم في البافر
    buffer_size: Optional[int] = None
    max_buffer_length: Optional[int] = None
    live_back_buffer_length: Optional[int] = None
    
    # إعدادات جدول المباريات
    show_matches_table: Optional[bool] = None
    hidden_channels: Optional[str] = None


# ---- Admin User (لوحة التحكم) ----
# الأدوار: owner (مالك) – manager (مدير) – sub_manager (مدير فرعي)

class AdminUser(SQLModel, table=True):
    """حساب مستخدم لوحة التحكم مع دور وصلاحيات."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True)
    password_hash: str = ""
    role: str = Field(default="manager", index=True)  # owner | manager | sub_manager
    parent_id: Optional[int] = Field(default=None, index=True)
    permissions: str = Field(default="{}")
    is_default: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: Optional[str] = Field(default=None)


class AdminCredentialsRead(SQLModel):
    username: str


class AdminCredentialsUpdate(SQLModel):
    current_password: Optional[str] = None
    new_username: Optional[str] = None
    new_password: Optional[str] = None


class AdminUserRead(SQLModel):
    """بيانات مستخدم للقراءة (بدون كلمة المرور)."""
    id: int
    username: str
    role: str
    parent_id: Optional[int] = None
    permissions: str = "{}"
    is_default: bool = False
    is_active: bool = True
    created_at: Optional[str] = None


class AdminUserCreate(SQLModel):
    """إنشاء مستخدم جديد."""
    username: str
    password: str
    role: str  # manager | sub_manager
    permissions: str = "{}"


class AdminUserUpdate(SQLModel):
    """تحديث مستخدم."""
    username: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[str] = None
    is_active: Optional[bool] = None


class LoginRequest(SQLModel):
    """طلب تسجيل الدخول."""
    username: str
    password: str


class LoginResponse(SQLModel):
    """استجابة تسجيل الدخول الناجح."""
    token: str
    user_id: int
    username: str
    role: str
    is_default: bool = False
    is_active: bool = True
    permissions: str = "{}"


# ---- Default Services Models ----

class DefaultServiceBase(SQLModel):
    name: str = Field(index=True)  # اسم الخدمة (مثل "القرآن الكريم")
    path: str  # مسار المشروع (مثلاً quran داخل جذر Zero)
    port: int  # البورت الافتراضي (مثل 3001)
    start_command: str  # الأمر لبدء تشغيل الخدمة (مثل "npm run serve")
    description: Optional[str] = None  # وصف الخدمة
    icon_url: Optional[str] = None  # أيقونة الخدمة
    is_active: bool = False  # هل الخدمة مفعلة
    is_running: bool = False  # هل الخدمة تعمل حالياً
    process_id: Optional[int] = None  # معرف العملية إذا كانت تعمل
    auto_start: bool = False  # هل تبدأ تلقائياً مع النظام


class DefaultService(DefaultServiceBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class DefaultServiceRead(DefaultServiceBase):
    id: int
    url: Optional[str] = None  # الرابط الكامل للخدمة (يتم حسابه تلقائياً)


class DefaultServiceCreate(DefaultServiceBase):
    pass


class DefaultServiceUpdate(SQLModel):
    name: Optional[str] = None
    path: Optional[str] = None
    port: Optional[int] = None
    start_command: Optional[str] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None
    is_active: Optional[bool] = None
    auto_start: Optional[bool] = None


# ---- Home Delivery Requests (طلبات التوصيل للمنزل) ----

# الحالات: new, contacted, completed, cancelled
class DeliveryRequestBase(SQLModel):
    name: str = Field(index=True)
    phone: str = Field(index=True)
    address: str
    status: str = Field(default="new", index=True)  # new | contacted | completed | cancelled
    notes: Optional[str] = None


class DeliveryRequest(DeliveryRequestBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: Optional[str] = Field(default=None)  # ISO date string


class DeliveryRequestCreate(SQLModel):
    name: str
    phone: str
    address: str


class DeliveryRequestUpdate(SQLModel):
    status: Optional[str] = None
    notes: Optional[str] = None


class DeliveryRequestRead(DeliveryRequestBase):
    id: int
    created_at: Optional[str] = None


# ---- Service Visit Tracking (إحصائيات الزيارات) ----

class ServiceVisit(SQLModel, table=True):
    """تسجيل زيارة واحدة لخدمة معينة"""
    id: Optional[int] = Field(default=None, primary_key=True)
    service_id: int = Field(index=True)          # رقم الخدمة
    service_name: str = ""                        # اسم الخدمة وقت الزيارة
    service_type: str = "custom"                  # custom أو default
    visit_date: str = Field(index=True)           # التاريخ بصيغة YYYY-MM-DD
    visit_count: int = 1                          # عدد الزيارات في ذلك اليوم


# ---- Notifications (الإشعارات) ----

class NotificationBase(SQLModel):
    title: str
    body: str
    icon_url: Optional[str] = None
    link_url: Optional[str] = None
    notification_type: str = "instant"  # instant أو scheduled
    scheduled_at: Optional[str] = None  # ISO datetime للإشعارات المجدولة
    is_sent: bool = False
    sent_at: Optional[str] = None
    created_at: Optional[str] = None


class Notification(NotificationBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class NotificationCreate(SQLModel):
    title: str
    body: str
    icon_url: Optional[str] = None
    link_url: Optional[str] = None
    notification_type: str = "instant"
    scheduled_at: Optional[str] = None


class NotificationRead(NotificationBase):
    id: int


class NotificationUpdate(SQLModel):
    title: Optional[str] = None
    body: Optional[str] = None
    icon_url: Optional[str] = None
    link_url: Optional[str] = None
    notification_type: Optional[str] = None
    scheduled_at: Optional[str] = None
    is_sent: Optional[bool] = None


# ---- Push Subscriptions (اشتراكات الإشعارات) ----

class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint: str = Field(index=True)
    p256dh: str = ""
    auth: str = ""
    created_at: Optional[str] = None


class PushSubscriptionCreate(SQLModel):
    endpoint: str
    p256dh: str
    auth: str
