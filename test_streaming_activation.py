#!/usr/bin/env python3
"""
اختبار نظام التفعيل التلقائي للبث المباشر
"""

import sys
import os
from pathlib import Path

# إضافة المسار للمشروع
sys.path.insert(0, str(Path(__file__).parent))

def test_read_key():
    """اختبار قراءة المفتاح من الملف المحلي"""
    print("🔍 اختبار قراءة المفتاح من الملف المحلي...")
    try:
        from backend.services import read_local_key
        key = read_local_key()
        
        if key:
            print(f"✅ تم قراءة المفتاح بنجاح: {key[:20]}...")
            return True
        else:
            print("❌ لم يتم العثور على المفتاح")
            return False
    except Exception as e:
        print(f"❌ خطأ في قراءة المفتاح: {e}")
        return False


def test_key_file_exists():
    """اختبار وجود ملف المفتاح"""
    print("\n🔍 اختبار وجود ملف المفتاح...")
    
    possible_paths = [
        Path("key.json"),
        Path("kay.json"),
        Path("/root/Zero/key.json"),
        Path("/root/Zero/kay.json"),
    ]
    
    found = False
    for path in possible_paths:
        if path.exists():
            print(f"✅ تم العثور على الملف: {path}")
            found = True
            
            # قراءة محتوى الملف
            try:
                import json
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"   📄 المحتوى: {list(data.keys())}")
            except Exception as e:
                print(f"   ⚠️ خطأ في قراءة الملف: {e}")
    
    if not found:
        print("❌ لم يتم العثور على أي ملف مفتاح")
    
    return found


def test_imports():
    """اختبار استيراد الوحدات المطلوبة"""
    print("\n🔍 اختبار استيراد الوحدات...")
    
    required_modules = [
        'requests',
        'sqlmodel',
        'fastapi',
        'psutil',
    ]
    
    all_ok = True
    for module in required_modules:
        try:
            __import__(module)
            print(f"✅ {module}")
        except ImportError:
            print(f"❌ {module} - غير موجود")
            all_ok = False
    
    return all_ok


def test_database_connection():
    """اختبار الاتصال بقاعدة البيانات"""
    print("\n🔍 اختبار الاتصال بقاعدة البيانات...")
    try:
        from backend.database import get_session
        from sqlmodel import Session
        
        # محاولة إنشاء session
        session_generator = get_session()
        session = next(session_generator)
        
        print("✅ تم الاتصال بقاعدة البيانات بنجاح")
        
        # إغلاق الـ session
        session.close()
        return True
        
    except Exception as e:
        print(f"❌ خطأ في الاتصال بقاعدة البيانات: {e}")
        return False


def test_mistserver_functions():
    """اختبار وجود دوال MistServer"""
    print("\n🔍 اختبار دوال MistServer...")
    
    try:
        from backend import services
        
        functions = [
            'get_mistserver_streams',
            'delete_mistserver_stream',
            'create_mistserver_stream',
            'delete_all_mistserver_streams',
            'read_local_key',
            'verify_key_and_fetch_channels',
            'activate_streaming_service',
        ]
        
        all_ok = True
        for func_name in functions:
            if hasattr(services, func_name):
                print(f"✅ {func_name}")
            else:
                print(f"❌ {func_name} - غير موجودة")
                all_ok = False
        
        return all_ok
        
    except Exception as e:
        print(f"❌ خطأ في استيراد services: {e}")
        return False


def main():
    """تشغيل جميع الاختبارات"""
    print("=" * 60)
    print("🧪 اختبار نظام التفعيل التلقائي للبث المباشر")
    print("=" * 60)
    
    results = []
    
    # الاختبارات
    results.append(("وجود ملف المفتاح", test_key_file_exists()))
    results.append(("استيراد الوحدات", test_imports()))
    results.append(("قراءة المفتاح", test_read_key()))
    results.append(("الاتصال بقاعدة البيانات", test_database_connection()))
    results.append(("دوال MistServer", test_mistserver_functions()))
    
    # عرض النتائج
    print("\n" + "=" * 60)
    print("📊 ملخص النتائج")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ نجح" if result else "❌ فشل"
        print(f"{status} - {test_name}")
        if result:
            passed += 1
    
    print("\n" + "=" * 60)
    percentage = (passed / total) * 100
    print(f"النتيجة النهائية: {passed}/{total} ({percentage:.1f}%)")
    
    if percentage == 100:
        print("🎉 جميع الاختبارات نجحت!")
    elif percentage >= 70:
        print("⚠️ بعض الاختبارات فشلت - يُنصح بالمراجعة")
    else:
        print("❌ فشلت معظم الاختبارات - يجب إصلاح المشاكل")
    
    print("=" * 60)
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
