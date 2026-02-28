#!/usr/bin/env python3
"""
إضافة عمود stream_key إلى جدول القنوات
"""

import sys
from pathlib import Path

# إضافة المسار للمشروع
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import create_engine, text
from backend.database import DATABASE_URL

def migrate():
    print("=" * 60)
    print("🔄 بدء migration: إضافة عمود stream_key")
    print("=" * 60)
    
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.begin() as conn:
            # التحقق من وجود العمود باستخدام PRAGMA (SQLite)
            result = conn.execute(text("PRAGMA table_info(channel)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'stream_key' in columns:
                print("✅ العمود stream_key موجود بالفعل")
            else:
                print("➕ إضافة عمود stream_key...")
                conn.execute(text(
                    "ALTER TABLE channel ADD COLUMN stream_key VARCHAR"
                ))
                print("✅ تم إضافة العمود stream_key بنجاح")
        
        print("\n" + "=" * 60)
        print("✅ اكتمل Migration بنجاح!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ خطأ في Migration: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
