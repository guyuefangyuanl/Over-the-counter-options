#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""调试app.py启动问题"""

import sys
import traceback

try:
    print("Step 1: Loading app.py...")
    from app import app
    print("✅ app.py loaded successfully")
    
    print("Step 2: Checking app configuration...")
    print(f"  NODE_ENV: {app.config.get('NODE_ENV')}")
    print(f"  Database: {app.db}")
    print(f"  Cloud DB: {app.cloud_db}")
    print("✅ Configuration OK")
    
    print("Step 3: Starting app...")
    app.run(host='0.0.0.0', port=5002, debug=False)
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    traceback.print_exc()
    sys.exit(1)
