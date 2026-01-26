#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""逐步测试导入"""

print("1. Testing os...")
import os
print("  ✅ os")

print("2. Testing time...")
import time
print("  ✅ time")

print("3. Testing logging...")
import logging
print("  ✅ logging")

print("4. Testing flask...")
from flask import Flask, jsonify, request
print("  ✅ flask")

print("5. Testing flask_cors...")
from flask_cors import CORS
print("  ✅ flask_cors")

print("6. Testing dotenv...")
from dotenv import load_dotenv
print("  ✅ dotenv")

print("7. Testing pymongo...")
from pymongo import MongoClient
print("  ✅ pymongo")

print("8. Testing akshare...")
import akshare as ak
print("  ✅ akshare")

print("9. Testing services.cloud_db...")
from services.cloud_db import CloudDbClient, CloudDbConfigError
print("  ✅ services.cloud_db")

print("\n✅ All imports successful!")
