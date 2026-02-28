# دليل البدء السريع - نظام البث المباشر المحدث

## 🚀 البدء السريع

### المتطلبات الأساسية
- ✅ ملف `key.json` أو `kay.json` في المسار `/root/Zero/`
- ✅ MistServer يعمل على `localhost:4242`
- ✅ اتصال بالإنترنت للوصول إلى `https://to.zerolag.live`

### تشغيل المشروع بأمر واحد (موصى به)

```bash
cd /root/Zero
./start.sh
```

يشغّل السكربت **الخادم الخلفي** و**الواجهة الأمامية** معاً. عند الضغط على `Ctrl+C` يتم إيقاف الاثنين.

- 🌐 الواجهة الأمامية: http://localhost:3000
- 🔧 لوحة التحكم: http://localhost:3000/admin
- 📡 API: http://localhost:8000/docs

---

### تشغيل يدوي (نفس الوضع - تطوير)

إذا أردت تشغيل كل جزء في طرفية منفصلة:

#### 1. الطرفية الأولى - الخادم الخلفي
```bash
cd /root/Zero
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. الطرفية الثانية - الواجهة الأمامية
```bash
cd /root/Zero/frontend
npm start
```

**ملاحظة:** يجب التشغيل من جذر المشروع (`/root/Zero`) حتى تعمل استيرادات `backend` بشكل صحيح.

---

## 🔄 وضع التطوير مقابل وضع الإنتاج

| | **وضع التطوير** (الحالي) | **وضع الإنتاج** |
|---|---------------------------|-------------------|
| **الخادم الخلفي** | `uvicorn ... --reload` (إعادة تحميل تلقائي عند تغيير الكود) | `uvicorn ...` بدون `--reload` |
| **الواجهة الأمامية** | `npm start` (خادم تطوير مع Hot Reload) | `npm run build` ثم خدمة الملفات الثابتة (مثلاً عبر Nginx أو نفس الخادم) |
| **الاستخدام** | تطوير وتجربة على الجهاز | نشر على سيرفر للمستخدمين النهائيين |

**الإجابة المختصرة:**  
تشغيلك الحالي (`uvicorn ... --reload` و `npm start`) هو **وضع تطوير** وليس إنتاج. في الإنتاج لا يُستخدم `--reload` ولا `npm start`؛ يُبنى الفرونت مرة واحدة ويُخدم كملفات ثابتة.

---

### تشغيل المشروع في طور الإنتاج

في الإنتاج تُبنى الواجهة الأمامية مرة واحدة، ويشغّل الخادم (FastAPI) كل شيء: الـ API وملفات الواجهة من مجلد `frontend/build`.

#### الطريقة الأولى: سكربت واحد (موصى به)

```bash
cd /root/Zero
chmod +x start-production.sh
./start-production.sh
```

السكربت يقوم بـ:
1. بناء الواجهة (`npm run build` داخل `frontend/`)
2. تشغيل الخادم على المنفذ 8000 (بدون `--reload`)

ثم افتح المتصفح على: **http://عنوان-الجهاز:8000**

#### الطريقة الثانية: خطوات يدوية

```bash
cd /root/Zero

# 1) بناء الواجهة الأمامية
cd frontend && npm run build && cd ..

# 2) تشغيل الخادم فقط (بدون --reload)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

- **الواجهة والـ API معاً:** http://0.0.0.0:8000  
- **لوحة التحكم:** http://0.0.0.0:8000/admin  
- **توثيق الـ API:** http://0.0.0.0:8000/docs  

#### ملاحظات طور الإنتاج

- الصور المرفوعة حديثاً تُخدم من `/uploads/images/` (الروابط القديمة `/static/images/` ما زالت تعمل).
- لا حاجة لتشغيل `npm start`؛ الخادم يخدم ملفات `frontend/build` تلقائياً عند وجود المجلد.

---

### تشغيل تلقائي عند إقلاع النظام (وضع إنتاج)

لجعل التطبيق يعمل عند تشغيل الجهاز بدون تشغيل يدوي:

1. ابنِ الواجهة مرة واحدة على الأقل: `cd /root/Zero && ./start-production.sh` (أو `cd frontend && npm run build`).
2. نسخ وتفعيل خدمة systemd:
   ```bash
   sudo cp /root/Zero/deploy/zero.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable zero
   sudo systemctl start zero
   ```
3. للتحقق: `sudo systemctl status zero`

التفاصيل والأوامر الإضافية في `deploy/README.md`.

---

## 📋 آلية التفعيل الجديدة

### قبل التحديث ❌
```
1. المستخدم يفتح لوحة التحكم
2. المستخدم يدخل بيانات الاشتراك يدوياً
3. النظام يقوم بالتفعيل
```

### بعد التحديث ✅
```
1. المستخدم يفتح لوحة التحكم
2. المستخدم يضغط "تفعيل الخدمة"
3. النظام يقرأ المفتاح تلقائياً من key.json
4. النظام يتحقق من المفتاح ويجلب القنوات
5. النظام يحذف القنوات القديمة ويضيف الجديدة
```

---

## 🔑 صيغة ملف المفتاح

### مثال على `key.json` أو `kay.json`:
```json
{
  "7979385421a5e88619bfc8fae21759c447bff68da7ac24389397d1a31040069d": "1"
}
```

**ملاحظة:** المفتاح هو key في JSON object، والقيمة غير مهمة.

---

## 📡 صيغة استجابة الخادم

### الطلب المرسل:
```http
POST https://to.zerolag.live/api/channels/verify-key/
Content-Type: application/json

{
  "key": "7979385421a5e88619bfc8fae21759c447bff68da7ac24389397d1a31040069d"
}
```

### الاستجابة المتوقعة:
```json
{
  "channels": {
    "ch1": {
      "الرابط": "dtsc://s2.zerolagvpn.com/stream1",
      "المشغل": "player1",
      "ملاحضه": "قناة رياضية"
    },
    "ch2": {
      "الرابط": "dtsc://s2.zerolagvpn.com/stream2",
      "ملاحضه": "قناة أخبار"
    }
  }
}
```

أو بالإنجليزية:
```json
{
  "channels": {
    "ch1": {
      "url": "dtsc://s2.zerolagvpn.com/stream1",
      "note": "Sports Channel"
    }
  }
}
```

**ملاحظة:** حقل "المشغل" يتم تجاهله ولا يستخدم في النظام.

---

## 🧪 الاختبار

### اختبار قراءة المفتاح فقط:
```bash
cd /root/Zero
python3 -c "from backend.services import read_local_key; print(read_local_key())"
```

### اختبار الاتصال بـ MistServer:
```bash
curl -X GET "http://localhost:8080/api/streaming/test-mistserver" \
  -H "Authorization: Basic YWRtaW46YWRtaW4="
```

### اختبار التفعيل الكامل:
```bash
curl -X POST "http://localhost:8080/api/streaming/activate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YWRtaW46YWRtaW4="
```

---

## 🐛 حل المشاكل الشائعة

### المشكلة: "لم يتم العثور على ملف المفتاح"
**الحل:**
```bash
# تحقق من وجود الملف
ls -la /root/Zero/kay.json
# أو
ls -la /root/Zero/key.json

# إذا لم يكن موجوداً، أنشئه:
echo '{"YOUR_KEY_HERE": "1"}' > /root/Zero/key.json
```

### المشكلة: "فشل الاتصال بـ MistServer"
**الحل:**
```bash
# تحقق من تشغيل MistServer
ps aux | grep mist

# تحقق من المنفذ
netstat -tulpn | grep 4242

# أعد تشغيل MistServer إذا لزم الأمر
```

### المشكلة: "فشل التحقق من المفتاح"
**الحل:**
```bash
# اختبر الاتصال بالخادم الخارجي
curl https://to.zerolag.live/api/channels/verify-key/ \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"key": "YOUR_KEY_HERE"}'

# تحقق من اتصال الإنترنت
ping -c 3 to.zerolag.live
```

---

## 📝 السجلات (Logs)

### سجلات Backend:
```bash
tail -f /root/Zero/backend/backend.log
```

### سجلات Python:
```bash
# عند تشغيل uvicorn، السجلات تظهر في الطرفية مباشرة
```

### سجلات MistServer:
```bash
# راجع سجلات MistServer حسب تكوينك
```

---

## 📚 الملفات المهمة

```
/root/Zero/
├── kay.json                          # ملف المفتاح (أو key.json)
├── backend/
│   ├── services.py                   # ⭐ تم تعديله
│   ├── main.py                       # ⭐ تم تعديله
│   └── models.py
├── frontend/
│   └── src/
│       └── components/
│           └── StreamingManager.js   # ⭐ تم تعديله
├── STREAMING_UPDATE_DOCS.md          # 📖 التوثيق الكامل
├── QUICK_START.md                    # 📖 هذا الملف
└── test_streaming_activation.py      # 🧪 ملف الاختبار
```

---

## 🔄 تحديث القنوات

لتحديث القنوات بعد تغيير المفتاح أو تحديث القنوات على الخادم:

1. افتح لوحة التحكم
2. اذهب إلى "إدارة البث المباشر"
3. اضغط "تفعيل الخدمة" مرة أخرى
4. سيتم حذف القنوات القديمة وجلب الجديدة تلقائياً

---

## 💡 نصائح

- 🔐 احتفظ بملف `key.json` آمناً ولا تشاركه
- 🔄 يمكنك إعادة تشغيل التفعيل في أي وقت لتحديث القنوات
- 📊 راجع سجلات النظام في حالة وجود مشاكل
- 🧪 استخدم ملف الاختبار للتحقق من صحة البيئة

---

## 🆘 الدعم

في حالة وجود مشاكل:
1. شغل ملف الاختبار: `python3 test_streaming_activation.py`
2. راجع السجلات
3. تحقق من متطلبات النظام
4. راجع التوثيق الكامل في `STREAMING_UPDATE_DOCS.md`

---

**تم التحديث:** 2025-09-29  
**الإصدار:** 2.0
