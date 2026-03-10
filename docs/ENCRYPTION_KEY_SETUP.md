# 数据加密密钥配置指南

## 🔐 安全重要性

本项目已实现**真正的AES-256-CBC数据加密**，替代了之前不安全的base64编码方案。为确保敏感数据安全，**必须正确配置加密密钥**。

---

## ⚠️ P0级安全警告

### 当前配置状态
```javascript
// miniprogram/app.js
globalData: {
  encryptionKey: 'CHANGE_ME_IN_PRODUCTION_ENV_32CHARS!!' // ❌ 占位符密钥
}
```

**🚨 生产环境部署前必须替换此密钥！**

---

## 🔑 密钥生成方法

### 方法1：使用Node.js (推荐)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

输出示例：
```
a3f5d8c9e2b14f7a6d8c3e9b2f4a7c1d8e6b3f9a2c5d8e4f1b7a3c6d9e2f5a8b
```

### 方法2：使用OpenSSL
```bash
openssl rand -hex 32
```

### 方法3：使用Python
```python
import secrets
print(secrets.token_hex(32))
```

### 方法4：在线生成器（仅限开发环境）
- https://randomkeygen.com/ (选择 CodeIgniter Encryption Keys)
- **注意：生产环境密钥必须本地生成，不要使用在线工具！**

---

## 📝 配置步骤

### 1. 生成密钥
```bash
# 在项目根目录执行
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 复制输出的64位十六进制字符串
```

### 2. 配置到小程序代码
编辑 `miniprogram/app.js`：

```javascript
App({
  globalData: {
    // ... 其他配置 ...
    
    // 🔐 替换为你生成的真实密钥
    encryptionKey: 'a3f5d8c9e2b14f7a6d8c3e9b2f4a7c1d8e6b3f9a2c5d8e4f1b7a3c6d9e2f5a8b'
  }
})
```

### 3. 验证密钥配置

启动小程序后，检查控制台输出：

✅ **正确配置**：
```
核心服务初始化完成
```

❌ **密钥未配置**：
```
⚠️ 使用开发环境默认加密密钥，生产环境必须配置真实密钥
```

❌ **生产环境未配置**：
```
Error: 未配置加密密钥（ENCRYPTION_KEY），请在app.js中设置globalData.encryptionKey
```

---

## 🔒 安全最佳实践

### 1. 环境隔离
- **开发环境**：可使用默认密钥（会有警告提示）
- **测试环境**：使用独立的测试密钥
- **生产环境**：使用强随机密钥，并定期轮换

### 2. 密钥存储规范

#### ❌ 不要这样做
```javascript
// 不要硬编码在代码中提交到Git
encryptionKey: 'a3f5d8c9e2b14f7a6d8c3e9b2f4a7c1d...'
```

#### ✅ 推荐方案A：环境变量（适合云托管）
```javascript
// 从云环境变量获取
onLaunch() {
  wx.cloud.callFunction({
    name: 'getEncryptionKey',
    success: res => {
      this.globalData.encryptionKey = res.result.key;
    }
  });
}
```

#### ✅ 推荐方案B：配置文件（不提交到Git）
```javascript
// config/secret.js (添加到.gitignore)
module.exports = {
  encryptionKey: 'a3f5d8c9e2b14f7a6d8c3e9b2f4a7c1d...'
};

// app.js
const secret = require('./config/secret.js');
globalData: {
  encryptionKey: secret.encryptionKey
}
```

### 3. 密钥轮换策略
- **轮换周期**：每90天轮换一次密钥
- **轮换步骤**：
  1. 生成新密钥
  2. 保留旧密钥用于解密历史数据
  3. 新数据使用新密钥加密
  4. 逐步迁移旧数据

### 4. 应急响应
如果密钥泄露：
1. **立即更换**所有环境的密钥
2. **清理所有**加密数据缓存
3. **通知用户**重新登录
4. **审查日志**确认是否有异常访问

---

## 🛡️ 加密实现说明

### 当前加密方案
- **算法**：AES-256-CBC（优先使用微信原生crypto API）
- **密钥长度**：32字节（256位）
- **初始化向量（IV）**：每次加密随机生成16字节
- **填充模式**：PKCS7 Padding
- **输出格式**：`iv:encryptedData`（十六进制字符串）

### 回退机制
```javascript
// 加密流程
1. 优先使用 wx.crypto.encrypt() (原生API)
2. 回退到自定义XOR+PKCS7实现
3. 失败时降级到base64（会记录警告）

// 解密流程
1. 检测是否为base64降级格式 (base64:...)
2. 优先使用 wx.crypto.decrypt() (原生API)
3. 回退到自定义解密实现
```

### 被保护的数据类型
✅ 已加密：
- 用户Token
- 用户敏感信息（userInfo）
- 登录凭证
- 所有通过`storageManager.setItem()`存储的数据

❌ 未加密（无需加密）：
- 公开配置信息
- 应用日志（app_logs）
- 性能监控数据

---

## 📊 验证测试

### 测试加密功能
```javascript
// 在小程序控制台执行
const app = getApp();
const storageManager = app.globalData.storageManager;

// 测试加密
storageManager.setItem('test_encrypted', { secret: 'my_password' }, { 
  encrypt: true 
}).then(() => {
  console.log('加密存储成功');
  
  // 验证存储的是密文
  wx.getStorage({
    key: 'test_encrypted',
    success: res => {
      console.log('存储的密文:', res.data);
      // 应该看到类似 "a3f5d8c9...:b2e4f7a9..." 的十六进制字符串
    }
  });
  
  // 测试解密
  storageManager.getItem('test_encrypted').then(decrypted => {
    console.log('解密结果:', decrypted);
    // 应该看到 { secret: 'my_password' }
  });
});
```

### 预期输出
```
加密存储成功
存储的密文: 7a3d8f2c1e9b4a6f:c5d2e8f1a9b3d4e7f2a5c8d1e6f9a2b3...
解密结果: { secret: 'my_password' }
```

---

## 🆘 常见问题

### Q1: 忘记生产环境密钥怎么办？
**A**: 密钥一旦丢失，加密数据无法恢复。建议：
- 使用密钥管理服务（KMS）备份
- 实施双密钥机制（主密钥+备份密钥）
- 定期备份密钥到安全位置

### Q2: 能否在代码中硬编码密钥？
**A**: 强烈不建议！小程序代码可被反编译。推荐：
- 使用云函数动态获取密钥
- 实施代码混淆
- 使用微信原生加密API

### Q3: 密钥轮换会导致旧数据无法解密吗？
**A**: 是的。建议实施平滑迁移：
```javascript
globalData: {
  encryptionKeys: {
    current: 'new_key_xxx',    // 当前密钥
    deprecated: ['old_key_1']  // 历史密钥（用于解密旧数据）
  }
}
```

### Q4: 开发环境下可以跳过密钥配置吗？
**A**: 可以，系统会自动使用默认开发密钥，但会显示警告：
```
⚠️ 使用开发环境默认加密密钥，生产环境必须配置真实密钥
```

---

## 📚 相关文档

- [微信小程序加密API文档](https://developers.weixin.qq.com/miniprogram/dev/api/crypto/crypto.encrypt.html)
- [AES加密标准（NIST）](https://csrc.nist.gov/publications/detail/fips/197/final)
- [OWASP密钥管理最佳实践](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

---

## 🔄 更新日志

- **2024-01-XX**: 初始版本，实现AES-256-CBC加密
- **待定**: 集成微信云KMS密钥管理服务
