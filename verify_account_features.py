import requests
import sys
import json

BASE_URL = "http://127.0.0.1:5002/api/v1"

def print_step(msg):
    print(f"\n{'='*20} {msg} {'='*20}")

def login_admin():
    print_step("Step 1: Admin Login")
    try:
        payload = {"username":"admin", "password":"admin123"}
        print(f"POST {BASE_URL}/auth/login")
        resp = requests.post(f"{BASE_URL}/auth/login", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            token = data['data']['token']
            print("Login Success. Token obtained.")
            return token
        else:
            print("Login Failed:", resp.text)
            return None
    except Exception as e:
        print("Connection failed. Is the server running?", e)
        return None

def seed_data(token):
    print_step("Step 2: Seed Test Data")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.post(f"{BASE_URL}/trade/positions/seed", headers=headers)
        print(f"POST /trade/positions/seed -> {resp.status_code}")
        print(resp.json())
    except Exception as e:
        print("Error:", e)

def get_positions(token):
    print_step("Step 3: Get Positions")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/trade/positions", headers=headers)
        print(f"GET /trade/positions -> {resp.status_code}")
        data = resp.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
        items = data.get('data', {}).get('items', [])
        if items:
            print(f"Found {len(items)} positions.")
        else:
            print("No positions found.")
    except Exception as e:
        print("Error:", e)

def get_profile(token):
    print_step("Step 4: Get Profile")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print(f"GET /auth/me -> {resp.status_code}")
        print(resp.json())
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    print("Starting Account Feature Verification...")
    token = login_admin()
    if token:
        get_profile(token)
        seed_data(token)
        get_positions(token)
    else:
        print("Skipping remaining tests due to login failure.")
