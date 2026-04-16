# دليل التثبيت والتشغيل

## المتطلبات الأساسية

هذا المشروع يتطلب **Node.js** (الإصدار 14 أو أحدث).

### تثبيت Node.js

1. قم بزيارة الموقع الرسمي: https://nodejs.org/
2. قم بتنزيل النسخة LTS (الموصى بها)
3. قم بتثبيت Node.js على جهازك
4. أعد تشغيل PowerShell/Terminal بعد التثبيت

### التحقق من التثبيت

بعد تثبيت Node.js، تحقق من التثبيت باستخدام:

```powershell
node --version
npm --version
```

## خطوات التشغيل

بعد تثبيت Node.js:

1. **الانتقال إلى مجلد المشروع:**
   ```powershell
   cd C:\Users\Match\quran\Quran-Data-version-2.0
   ```

2. **تثبيت التبعيات:**
   ```powershell
   npm install
   ```

3. **تشغيل الخادم:**
   ```powershell
   npm start
   ```

4. **الوصول إلى API:**
   - الخادم سيعمل على: `http://localhost:5000`
   - الوثائق: `http://localhost:5000/docs`
   - API: `http://localhost:5000/api`

## استخدام Docker (بديل)

إذا كان لديك Docker مثبت:

```powershell
# بناء الصورة
docker build -t quran_data .

# تشغيل الحاوية
docker run -d -p 5000:5000 -e PORT=5000 -e API_RATE_LIMIT=300 --name quran_data_container quran_data
```
