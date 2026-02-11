
import os
import time
from datetime import datetime, timedelta
import sys
import traceback

try:
    import jwt
except ImportError:
    print("ERROR: jwt module not found. Try 'pip install pyjwt'")
    sys.exit(1)

# 模拟 Auth Service 中的逻辑
class AuthServiceMock:
    def __init__(self):
        self.jwt_secret = "dev-secret-key-change-in-production"
        self.jwt_algorithm = "HS256"
        self.jwt_expires_seconds = 86400

    def issue_token(self, username: str, role: str) -> str:
        # 原始逻辑
        now = datetime.utcnow()
        exp = now + timedelta(seconds=self.jwt_expires_seconds)
        
        print(f"DEBUG: utcnow={now}")
        print(f"DEBUG: utcnow.timestamp={now.timestamp()}")
        print(f"DEBUG: time.time={time.time()}")
        
        payload = {
            "sub": username,
            "role": role,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        print(f"DEBUG: payload={payload}")
        
        token = jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
        return token

    def verify_token(self, token):
        try:
            # 模拟 pyjwt 的 decode 行为，它会检查 exp
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            print("Token is VALID")
            print(f"Decoded payload: {payload}")
        except jwt.ExpiredSignatureError:
            print("Token is EXPIRED")
        except Exception as e:
            print(f"Token is INVALID: {e}")

try:
    auth = AuthServiceMock()
    token = auth.issue_token("testuser", "user")
    auth.verify_token(token)
except Exception:
    traceback.print_exc()
