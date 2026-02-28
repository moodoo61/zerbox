#!/usr/bin/env python3
"""
اختبار التفعيل الكامل
"""

import sys
from pathlib import Path

# إضافة المسار للمشروع
sys.path.insert(0, str(Path(__file__).parent))

def main():
    print("="*60)
    print("🧪 اختبار التفعيل الكامل")
    print("="*60)
    
    try:
        from backend.services import read_local_key, verify_key_and_fetch_channels
        
        # قراءة المفتاح
        print("\n📝 الخطوة 1: قراءة المفتاح")
        key = read_local_key()
        
        if not key:
            print("❌ لم يتم العثور على ملف المفتاح!")
            return False
        
        print(f"✅ تم قراءة المفتاح: {key[:20]}...")
        
        # التحقق وجلب القنوات
        print("\n📝 الخطوة 2: التحقق من المفتاح وجلب القنوات")
        result = verify_key_and_fetch_channels(key)
        
        if result["status"] == "success":
            channels = result["channels"]
            print(f"\n✅ {result['message']}")
            print(f"\n📺 القنوات المجلوبة:")
            print("="*60)
            
            for i, (channel_name, channel_info) in enumerate(channels.items(), 1):
                print(f"\n{i}. {channel_name}")
                print(f"   الرابط: {channel_info.get('url', 'N/A')}")
                notes = channel_info.get('note', channel_info.get('ملاحضه', ''))
                if notes:
                    print(f"   ملاحظة: {notes}")
            
            print("\n" + "="*60)
            print("✅ نجح الاختبار بالكامل!")
            print("="*60)
            return True
        else:
            print(f"❌ فشل: {result.get('message', 'خطأ غير معروف')}")
            return False
            
    except Exception as e:
        print(f"\n❌ خطأ: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
