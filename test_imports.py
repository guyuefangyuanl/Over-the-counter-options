import sys
import os
sys.path.append(os.getcwd())
try:
    from models.group import GroupModel
    from services.cloud_db import CloudDbClient
    print("Imports OK")
except Exception as e:
    import traceback
    print(f"Error: {e}")
    traceback.print_exc()
