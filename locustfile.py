from locust import HttpUser, task, between
import random

class OtcUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """
        Login and get token
        """
        # Mock login - assume we have a way to get token or we use a hardcoded dev token
        # For real test, we should hit /api/v1/auth/login
        self.token = "mock_token_for_load_test" 
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def get_quotes(self):
        self.client.get("/api/v1/stock/search?keyword=600", headers=self.headers)

    @task(1)
    def get_account(self):
        self.client.get("/api/v1/trade/account", headers=self.headers)

    @task(1)
    def get_positions(self):
        self.client.get("/api/v1/trade/positions", headers=self.headers)
        
    @task(1)
    def calc_greeks(self):
        self.client.post("/api/v1/trade/risk/greeks", json={
            "S": 3000, "K": 3100, "T": 0.5, "r": 0.03, "sigma": 0.25
        }, headers=self.headers)

    # @task(1)
    # def place_order(self):
    #     # Be careful with creating too many orders in DB
    #     pass
