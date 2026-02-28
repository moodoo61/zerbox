# رفع مشروع Zero على GitHub والنشر على أجهزة متعددة

## 1. نظرة عامة على المشروع

- **Backend:** FastAPI (Python) — المنفذ 8000، يخدم الواجهة والـ API.
- **Frontend:** React (في `frontend/`) — يُبنى ثم يُخدم كملفات ثابتة من الـ Backend.
- **مشاريع مرتبطة داخل المستودع:** `frontend/quran` (القرآن)، `qafiyah` (قافية).
- **ملفات/خدمات خارج مجلد المشروع (حسب التثبيت):**
  - **Jellyfin:** `/usr/lib/jellyfin` — سيرفر وسائط (اختياري).
  - **MistServer:** للبث — يُدار خارجياً.
  - **NetworkManager + zero-network-helper:** إعدادات الشبكة والهوتسبوت.
  - **ملفات مفتاح البث:** `key.json` أو `kay.json` (يُفضّل أن تكون داخل المشروع أو يُشار إليها عبر متغير بيئة).

---

## 2. التبعيات والنهج الموصى به

### 2.1 التبعيات الأساسية

| المكوّن        | التبعيات |
|----------------|----------|
| **Backend**    | Python 3، `pip install -r backend/requirements.txt` |
| **Frontend**   | Node.js و npm، `npm install` ثم `npm run build` |
| **قرآن**       | داخل `frontend/quran` — `npm install` و `npm run serve` (اختياري) |
| **قافية**      | داخل `qafiyah` — `npm install` في الجذر و/أو `qafiyah/apps/web` (اختياري) |
| **النشر (systemd)** | NetworkManager (للهوتسبوت)، اختياري: Jellyfin، MistServer |

### 2.2 نهج رفع المشروع على GitHub

1. **إنشاء مستودع جديد** على GitHub (مثلاً `your-org/Zero`).
2. **عدم رفع:** `node_modules/`، `__pycache__/`، `*.pyc`، `.env`، `database.db`، `frontend/build`، `key.json`، `kay.json`، `vapid_keys.json`، وأي ملفات تحتوي أسراراً — استخدم **.gitignore** في جذر المشروع (انظر القسم 4).
3. **رفع:** كود المصدر، `backend/requirements.txt`، `frontend/package.json`، ملفات `deploy/` (مع استخدام مسار قابل للتخصيص كما في القسم 3).
4. **الاستنساخ على جهاز جديد:**
   ```bash
   git clone https://github.com/your-org/Zero.git
   cd Zero
   ./deploy/install-from-bundle.sh   # أو خطوات التثبيت اليدوية أدناه
   ```
5. **تخصيص المسار:** إذا لم يكن المشروع في `/root/Zero`، تعيين `ZERO_ROOT` أو تعديل ملفات systemd كما هو موضح في `deploy/README.md`.

### 2.3 خطوات التثبيت على جهاز جديد (بدون حزمة)

```bash
# من مجلد المشروع (مثلاً ~/Zero بعد الاستنساخ)
cd /path/to/Zero

# 1) Backend
pip3 install -r backend/requirements.txt

# 2) Frontend
cd frontend && npm install && npm run build && cd ..

# 3) تشغيل
./start-production.sh
```

لتفعيل التشغيل التلقائي عند الإقلاع، راجع `deploy/README.md` (خدمات zero و zero-network-helper).

---

## 3. أخطاء وتعديلات لتجنّب التعارض على أجهزة أخرى

تم تطبيق التعديلات التالية في الكود لضمان عمل المشروع على أي مسار وعلى أجهزة متعددة:

### 3.1 مسارات ثابتة تم إصلاحها

| الملف | المشكلة | الحل |
|-------|---------|------|
| `backend/database.py` | `sqlite:///../database.db` يعتمد على مجلد التشغيل وقد يضع DB خارج المشروع | استخدام مسار قاعدة البيانات نسبةً إلى جذر المشروع (متغير بيئة اختياري `DATABASE_URL` أو `ZERO_ROOT`) |
| `backend/services/default_services.py` | مسارات ثابتة مثل `/root/Zero/frontend/quran` و `/root/Zero/qafiyah` | حساب جذر المشروع ديناميكياً واستخدامه للخدمات الداخلية؛ Jellyfin يبقى `/usr/lib/jellyfin` أو يُعدّل يدوياً |
| `backend/services/streaming.py` | البحث عن `key.json` في `/root/Zero/` فقط | البحث أولاً في جذر المشروع المحسوب ديناميكياً، ثم المسارات النسبية |
| `deploy/zero.service` | `WorkingDirectory=/root/Zero` و Documentation مطلق | استخدام قالب أو تعليمات لتعديل المسار حسب الجهاز (والمشروع يدعم `ZERO_ROOT`) |
| `deploy/zero-network-helper.service` | نفس المشكلة | نفس النهج — تعليمات واضحة + إمكانية استبدال المسار عند التثبيت |
| `deploy/README.md` | ذكر `/root/Zero` فقط | توضيح إمكانية استخدام مسار آخر وتعديل ملفات الخدمة |
| `backend/requirements.txt` | وجود `recharts` (مكتبة واجهة أمامية وليست بايثون) | إزالة `recharts` من requirements لتجنّب أخطاء التثبيت على أجهزة أخرى |

### 3.2 ملفات وبيئات حساسة (لا تُرفع إلى GitHub)

- `database.db` — قاعدة البيانات المحلية.
- `key.json` / `kay.json` — مفاتيح البث.
- `vapid_keys.json` — مفاتيح Web Push.
- `.env` في أي مجلد (إن وُجد).
- `frontend/build` — يُعاد بناؤه على كل جهاز.
- `node_modules/` و `__pycache__/` — تُستعاد من `package.json` و `requirements.txt`.

يُنصح بإضافة ملف `.env.example` يوضح المتغيرات المطلوبة (مثل `ZERO_ROOT`، `DATABASE_URL` إن لزم) دون قيم حقيقية.

### 3.3 المشاريع المرتبطة (قرآن، قافية)

- تبقى **داخل المستودع** كجزء من Zero، لذا الاستنساخ يجلبها.
- إذا وُجدت مراجع خارجية (روابط، سكربتات) لمسارات خارج المشروع، يُفضّل استبدالها بمسارات نسبية أو متغيرات بيئة.

---

## 4. محتويات .gitignore المقترحة (جذر المشروع)

تم إنشاء `.gitignore` في جذر المشروع يتضمن:

- `node_modules/`، `__pycache__/`، `*.pyc`، `.env`، `*.log`
- `database.db`، `key.json`، `kay.json`، `vapid_keys.json`
- `frontend/build`، `frontend/quran/node_modules`، مجلدات build و node_modules داخل `qafiyah`
- ملفات نظام وتحرير (مثل `.DS_Store`)

بهذا يكون رفع المشروع إلى GitHub آمناً ولا يرفع بيانات أو أسرار.

---

## 5. ملخص سريع

- **للرفع على GitHub:** استخدم `.gitignore`، لا ترفع أسراراً ولا `database.db` ولا `node_modules`/`build`.
- **للتشغيل على أجهزة كثيرة:** استخدم مساراً ديناميكياً لجذر المشروع في الكود؛ غيّر مسار الخدمات (systemd) حسب كل جهاز أو استخدم متغير بيئة.
- **التبعيات:** Python + requirements.txt، Node + npm لكل من frontend و (اختياري) قرآن وقافية؛ نظامياً: NetworkManager للشبكة، واختياري Jellyfin/MistServer.
- **التعديلات المطبّقة في الكود:** قاعدة البيانات نسبةً لجذر المشروع، الخدمات الافتراضية بمسارات ديناميكية، بحث مفتاح البث من جذر المشروع، إزالة `recharts` من requirements، وملفات النشر مع توثيق واضح لاستبدال المسار.
