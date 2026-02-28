# توثيق API الخارجي

## 📡 نقاط النهاية (Endpoints)

### 1️⃣ التحقق من المفتاح

**Endpoint:**  
`POST https://to.zerolag.live/api/channels/verify-key/`

**الطلب:**
```http
POST /api/channels/verify-key/ HTTP/1.1
Host: to.zerolag.live
Content-Type: application/json

{
  "key": "7979385421a5e88619bfc8fae21759c447bff68da7ac24389397d1a31040069d"
}
```

**الاستجابة (نجاح):**
```json
{
  "status": "success",
  "message": "المفتاح صالح"
}
```

**الاستجابة (فشل):**
```json
{
  "status": "error",
  "message": "المفتاح غير صالح"
}
```

---

### 2️⃣ جلب القنوات

**Endpoint:**  
`GET https://to.zerolag.live/api/channels/`

**الطلب:**
```http
GET /api/channels/ HTTP/1.1
Host: to.zerolag.live
Content-Type: application/json
X-Channel-Key: 7979385421a5e88619bfc8fae21759c447bff68da7ac24389397d1a31040069d
```

**⚠️ ملاحظة هامة:**
- المفتاح يُرسل في الـ **header** وليس في الـ body أو query params
- اسم الـ header: `X-Channel-Key`
- يجب إضافة `/` في نهاية الـ URL (Django requirement)

**الاستجابة:**
```json
{
  "channels": [
    {
      "id": 6,
      "name": "موزع 1",
      "is_active": true,
      "qualities": [
        {
          "id": 11,
          "name": "قناة 1",
          "url": "dtsc://s2.zerolagvpn.com/ch1?user=G6BN849003H1",
          "player": "flv",
          "is_active": true,
          "notes": ""
        },
        {
          "id": 12,
          "name": "قناة 2",
          "url": "dtsc://s2.zerolagvpn.com/ch2?user=G6BN849003H1",
          "player": "flv",
          "is_active": true,
          "notes": "قناة رياضية"
        }
      ]
    }
  ]
}
```

---

## 📋 شرح بنية البيانات

### الموزعون (Distributors)
```json
{
  "id": 6,
  "name": "موزع 1",
  "is_active": true,
  "qualities": [...]
}
```

- `id`: معرف الموزع
- `name`: اسم الموزع
- `is_active`: حالة الموزع (نشط/غير نشط)
- `qualities`: قائمة القنوات/الجودات

### القنوات (Qualities/Channels)
```json
{
  "id": 11,
  "name": "قناة 1",
  "url": "dtsc://...",
  "player": "flv",
  "is_active": true,
  "notes": "ملاحظات"
}
```

- `id`: معرف القناة
- `name`: اسم القناة
- `url`: رابط البث
- `player`: نوع المشغل (يتم تجاهله في نظامنا)
- `is_active`: حالة القناة
- `notes`: ملاحظات إضافية

---

## 🔄 كيفية المعالجة في نظامنا

### 1. التحقق من المفتاح
```python
verify_response = requests.post(
    "https://to.zerolag.live/api/channels/verify-key/",
    json={"key": key},
    timeout=30,
    headers={"Content-Type": "application/json"}
)
```

### 2. جلب القنوات
```python
channels_response = requests.get(
    "https://to.zerolag.live/api/channels/",
    timeout=30,
    headers={
        "Content-Type": "application/json",
        "X-Channel-Key": key  # ⚠️ المفتاح في الـ header
    }
)
```

### 3. معالجة البيانات
```python
channels_data = channels_response.json()
channels_list = channels_data.get("channels", [])

formatted_channels = {}
for distributor in channels_list:
    if not distributor.get("is_active", True):
        continue
        
    qualities = distributor.get("qualities", [])
    
    for quality in qualities:
        if not quality.get("is_active", True):
            continue
        
        channel_name = quality.get("name")
        channel_url = quality.get("url")
        notes = quality.get("notes", "")
        
        if channel_url:
            formatted_channels[channel_name] = {
                "url": channel_url,
                "note": notes
            }
```

---

## 🧪 الاختبار

### باستخدام curl:

**التحقق من المفتاح:**
```bash
curl -X POST "https://to.zerolag.live/api/channels/verify-key/" \
  -H "Content-Type: application/json" \
  -d '{"key": "YOUR_KEY_HERE"}'
```

**جلب القنوات:**
```bash
curl -X GET "https://to.zerolag.live/api/channels/" \
  -H "Content-Type: application/json" \
  -H "X-Channel-Key: YOUR_KEY_HERE"
```

### باستخدام Python:
```bash
cd /root/Zero
python3 test_api_connection.py
```

---

## ⚠️ الأخطاء الشائعة

### 1. خطأ 405 (Method Not Allowed)
- **السبب:** استخدام POST بدلاً من GET لجلب القنوات
- **الحل:** استخدم GET للقنوات

### 2. خطأ 401 (Unauthorized)
- **السبب:** المفتاح غير موجود أو في المكان الخطأ
- **الحل:** أرسل المفتاح في header `X-Channel-Key`

### 3. خطأ 500 (RuntimeError - APPEND_SLASH)
- **السبب:** عدم وجود `/` في نهاية الـ URL
- **الحل:** استخدم `/api/channels/` بدلاً من `/api/channels`

---

## 📌 ملخص سريع

| العنصر | القيمة |
|--------|---------|
| نقطة التحقق | `POST /api/channels/verify-key/` |
| نقطة جلب القنوات | `GET /api/channels/` |
| طريقة إرسال المفتاح (تحقق) | Body JSON: `{"key": "..."}` |
| طريقة إرسال المفتاح (جلب) | Header: `X-Channel-Key: ...` |
| الـ slash في النهاية | **مطلوب** `/` |
| القنوات النشطة فقط | `is_active: true` |
| حقل المشغل | **يتم تجاهله** |

---

**آخر تحديث:** 2025-09-30  
**الحالة:** ✅ مختبر ويعمل بشكل صحيح
