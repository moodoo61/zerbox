#!/usr/bin/env python3
"""
اختبار الاتصال بـ API الخارجي
"""

import sys
import requests
import json
from pathlib import Path

# إضافة المسار للمشروع
sys.path.insert(0, str(Path(__file__).parent))

def read_key_from_file():
    """قراءة المفتاح من الملف"""
    possible_paths = [
        Path("key.json"),
        Path("kay.json"),
        Path("/root/Zero/key.json"),
        Path("/root/Zero/kay.json"),
    ]
    
    for key_path in possible_paths:
        try:
            if key_path.exists():
                with open(key_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        keys = list(data.keys())
                        if keys:
                            return keys[0]
        except Exception as e:
            continue
    
    return None


def test_verify_key_endpoint(key):
    """اختبار نقطة التحقق من المفتاح"""
    print("\n" + "="*60)
    print("🔍 اختبار نقطة التحقق من المفتاح")
    print("="*60)
    
    verify_url = "https://to.zerolag.live/api/channels/verify-key/"
    
    try:
        print(f"📤 إرسال طلب إلى: {verify_url}")
        print(f"🔑 المفتاح: {key[:20]}...")
        
        response = requests.post(
            verify_url,
            json={"key": key},
            timeout=30,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"\n📥 رمز الاستجابة: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"✅ الاستجابة: {json.dumps(data, ensure_ascii=False, indent=2)}")
            return True, data
        else:
            print(f"❌ فشل الطلب: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"❌ خطأ: {str(e)}")
        return False, None


def test_fetch_channels_endpoint(key):
    """اختبار نقطة جلب القنوات"""
    print("\n" + "="*60)
    print("🔍 اختبار نقطة جلب القنوات")
    print("="*60)
    
    channels_url = "https://to.zerolag.live/api/channels/"
    
    try:
        print(f"📤 إرسال طلب إلى: {channels_url}")
        print(f"🔑 المفتاح: {key[:20]}...")
        
        response = requests.get(
            channels_url,
            timeout=30,
            headers={
                "Content-Type": "application/json",
                "X-Channel-Key": key  # إرسال المفتاح في الـ header
            }
        )
        
        print(f"\n📥 رمز الاستجابة: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"✅ نوع البيانات: {type(data)}")
            
            # عرض عينة من البيانات
            if isinstance(data, dict):
                print(f"📋 عدد المفاتيح: {len(data)}")
                
                # عرض أول 3 قنوات كمثال
                count = 0
                for channel_name, channel_info in list(data.items())[:3]:
                    count += 1
                    print(f"\n🎬 القناة {count}: {channel_name}")
                    if isinstance(channel_info, dict):
                        for key, value in channel_info.items():
                            print(f"   - {key}: {value}")
                    else:
                        print(f"   - القيمة: {channel_info}")
                
                if len(data) > 3:
                    print(f"\n... و {len(data) - 3} قناة أخرى")
            else:
                print(f"⚠️ البيانات ليست dictionary: {data}")
            
            return True, data
        else:
            print(f"❌ فشل الطلب: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"❌ خطأ: {str(e)}")
        return False, None


def test_combined_flow(key):
    """اختبار العملية الكاملة: التحقق ثم جلب القنوات"""
    print("\n" + "="*60)
    print("🔄 اختبار العملية الكاملة")
    print("="*60)
    
    # الخطوة 1: التحقق
    verify_success, verify_data = test_verify_key_endpoint(key)
    
    if not verify_success:
        print("\n❌ فشل التحقق من المفتاح، لن يتم جلب القنوات")
        return False
    
    # الخطوة 2: جلب القنوات
    channels_success, channels_data = test_fetch_channels_endpoint(key)
    
    if not channels_success:
        print("\n❌ فشل جلب القنوات")
        return False
    
    print("\n" + "="*60)
    print("✅ نجحت العملية الكاملة!")
    print("="*60)
    
    return True


def main():
    print("="*60)
    print("🧪 اختبار الاتصال بـ API الخارجي")
    print("="*60)
    
    # قراءة المفتاح
    key = read_key_from_file()
    
    if not key:
        print("❌ لم يتم العثور على ملف المفتاح!")
        return False
    
    print(f"\n✅ تم قراءة المفتاح: {key[:20]}...")
    
    # اختبار العملية الكاملة
    success = test_combined_flow(key)
    
    return success


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
