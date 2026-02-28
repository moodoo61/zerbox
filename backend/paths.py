# -*- coding: utf-8 -*-
"""جذر المشروع والمسارات المشتركة — لاستخدامها على أي جهاز دون مسارات ثابتة."""
import os

# جذر المشروع (المجلد الذي يحتوي على backend/)
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.environ.get("ZERO_ROOT", os.path.dirname(_BACKEND_DIR))
