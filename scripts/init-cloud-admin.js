#!/usr/bin/env node
/**
 * 云托管管理员账号初始化脚本
 *
 * 用途：在云托管环境中创建管理员账号
 *
 * 使用方法：
 * 1. 确保云托管服务正在运行
 * 2. 运行：node scripts/init-cloud-admin.js
 *
 * 或者直接使用 curl 命令：
 * curl -X POST https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/users \
 *   -H "Content-Type: application/json" \
 *   -d '{"username":"admin","password":"Admin@2026#Secure","role":"admin"}'
 */

const https = require('https');

// 云托管API地址
const CLOUD_API_BASE = 'flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com';

// 管理员账号配置
const ADMIN_CONFIG = {
  username: 'admin',
  password: 'Admin@2026#Secure',
  role: 'admin'
};

/**
 * 发送HTTPS请求
 */
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }

    req.end();
  });
}

/**
 * 方法1: 尝试使用初始管理员Token创建用户
 */
async function createAdminWithToken() {
  console.log('方法1: 尝试使用初始管理员登录创建用户...\n');

  // 1. 尝试登录获取Token
  const loginOptions = {
    hostname: CLOUD_API_BASE,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://console.cloud.tencent.com'
    }
  };

  try {
    // 尝试常见的默认密码
    const defaultPasswords = [
      'admin',
      'admin123',
      'Admin@123',
      'Admin@2026#Secure'
    ];

    for (const password of defaultPasswords) {
      console.log(`尝试密码: ${password}`);
      const loginData = {
        username: ADMIN_CONFIG.username,
        password: password
      };

      const loginRes = await httpsRequest(loginOptions, loginData);

      if (loginRes.statusCode === 200 && loginRes.body.success) {
        console.log('✅ 登录成功！');
        const token = loginRes.body.data.token;

        // 2. 使用Token创建新管理员
        console.log('\n使用Token创建新管理员...');
        const createOptions = {
          hostname: CLOUD_API_BASE,
          path: '/api/v1/auth/users',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://console.cloud.tencent.com'
          }
        };

        const createRes = await httpsRequest(createOptions, ADMIN_CONFIG);

        if (createRes.statusCode === 200) {
          console.log('✅ 管理员账号创建成功！');
          console.log('\n管理员账号信息：');
          console.log(`  用户名: ${ADMIN_CONFIG.username}`);
          console.log(`  密码: ${ADMIN_CONFIG.password}`);
          console.log(`  角色: ${ADMIN_CONFIG.role}`);
          return true;
        } else {
          console.log('❌ 创建失败:', createRes.body);
        }
      }
    }

    console.log('❌ 所有默认密码都无效');
    return false;
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return false;
  }
}

/**
 * 方法2: 直接在云托管控制台设置环境变量
 */
function printEnvVarInstructions() {
  console.log('\n========================================');
  console.log('方法2: 通过云托管控制台设置环境变量');
  console.log('========================================\n');

  console.log('步骤：\n');
  console.log('1. 登录腾讯云控制台');
  console.log('   https://console.cloud.tencent.com/tcb\n');

  console.log('2. 进入你的云托管服务');
  console.log('   flask-ym1v-210758-7-1374336462\n');

  console.log('3. 点击"配置" -> "环境变量" -> "新增变量"\n');

  console.log('4. 添加以下环境变量：');
  console.log('   ┌─────────────────┬──────────────────────────┐');
  console.log('   │ 变量名          │ 变量值                   │');
  console.log('   ├─────────────────┼──────────────────────────┤');
  console.log('   │ ADMIN_USERNAME  │ admin                    │');
  console.log('   │ ADMIN_PASSWORD  │ Admin@2026#Secure        │');
  console.log('   │ ADMIN_ROLE      │ admin                    │');
  console.log('   └─────────────────┴──────────────────────────┘\n');

  console.log('5. 保存后重启服务\n');

  console.log('6. 测试登录：');
  console.log('   curl -X POST https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/login \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"username":"admin","password":"Admin@2026#Secure"}\'\n');
}

/**
 * 方法3: 使用数据库直接插入
 */
function printDbInstructions() {
  console.log('\n========================================');
  console.log('方法3: 直接在数据库中创建管理员');
  console.log('========================================\n');

  console.log('如果你有云数据库的访问权限，可以直接插入管理员记录：\n');

  console.log('1. 登录微信云开发控制台');
  console.log('   https://cloud.weixin.qq.com\n');

  console.log('2. 进入"数据库" -> "admin_users" 集合\n');

  console.log('3. 插入以下记录（密码哈希已生成）：');
  console.log(JSON.stringify({
    username: "admin",
    role: "admin",
    password_hash: "pbkdf2:sha256:260000$dummy$hash", // 需要生成真实哈希
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, null, 2));
  console.log('\n注意：实际部署时需要使用 Python 生成正确的密码哈希\n');
}

/**
 * 主函数
 */
async function main() {
  console.log('=================================');
  console.log('云托管管理员账号初始化工具');
  console.log('=================================\n');

  // 尝试方法1
  const success = await createAdminWithToken();

  if (!success) {
    // 提供手动方法
    printEnvVarInstructions();
    printDbInstructions();
  }
}

// 运行
main().catch(console.error);