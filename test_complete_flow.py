#!/usr/bin/env python3
"""
اختبار العملية الكاملة: من قراءة المفتاح إلى إضافة القنوات في MistServer
"""

import sys
from pathlib import Path

# إضافة المسار للمشروع
sys.path.insert(0, str(Path(__file__).parent))

def main():
    print("="*70)
    print("🧪 اختبار العملية الكاملة للتفعيل")
    print("="*70)
    
    try:
        from backend.database import get_session
        from backend.services import activate_streaming_service, get_mistserver_streams
        
        # الحصول على session
        session_generator = get_session()
        db = next(session_generator)
        
        print("\n" + "="*70)
        print("🚀 بدء عملية التفعيل...")
        print("="*70)
        
        # تشغيل عملية التفعيل الكاملة
        result = activate_streaming_service(db)
        
        print("\n" + "="*70)
        print("📋 معلومات الاشتراك:")
        print("="*70)
        print(f"✅ الحالة: {'نشط' if result.is_active else 'غير نشط'}")
        print(f"📅 تاريخ التفعيل: {result.activation_date}")
        print(f"🔗 الخادم الخارجي: {result.external_server_url}")
        print(f"🔄 آخر مزامنة: {result.last_sync_date}")
        
        # التحقق من القنوات في MistServer
        print("\n" + "="*70)
        print("🔍 التحقق من القنوات في MistServer:")
        print("="*70)
        
        try:
            streams_data = get_mistserver_streams()
            streams = streams_data.get("streams", {})
            
            if streams:
                print(f"✅ تم العثور على {len(streams)} قناة في MistServer:")
                for i, (stream_name, stream_info) in enumerate(streams.items(), 1):
                    print(f"\n{i}. {stream_name}")
                    print(f"   المصدر: {stream_info.get('source', 'N/A')}")
                    print(f"   الحالة: {stream_info.get('online', 'N/A')}")
            else:
                print("⚠️ لا توجد قنوات في MistServer")
                
        except Exception as e:
            print(f"❌ فشل الاتصال بـ MistServer: {e}")
        
        # التحقق من القنوات في قاعدة البيانات
        print("\n" + "="*70)
        print("🔍 التحقق من القنوات في قاعدة البيانات:")
        print("="*70)
        
        from sqlmodel import select
        from backend import models
        
        channels = db.exec(select(models.Channel)).all()
        
        if channels:
            print(f"✅ تم العثور على {len(channels)} قناة في قاعدة البيانات:")
            for i, channel in enumerate(channels, 1):
                print(f"\n{i}. {channel.name}")
                print(f"   الرابط: {channel.url}")
                print(f"   الفئة: {channel.category}")
                print(f"   نشطة: {'نعم' if channel.is_active else 'لا'}")
        else:
            print("⚠️ لا توجد قنوات في قاعدة البيانات")
        
        # إغلاق الـ session
        db.close()
        
        print("\n" + "="*70)
        print("✅ اكتمل الاختبار بنجاح!")
        print("="*70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ خطأ في الاختبار: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
