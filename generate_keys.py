import secrets

print("=== 生产环境安全密钥 ===")
print(f"SECRET_KEY={secrets.token_hex(32)}")
print(f"JWT_SECRET={secrets.token_hex(32)}")
print("\n请将以上密钥复制到 .env.production 文件中")
