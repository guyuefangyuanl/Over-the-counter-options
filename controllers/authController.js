const Database = require('better-sqlite3');
const path = require('path');
const { generateToken } = require('../middleware/auth');

// 创建数据库连接
const dbPath = path.join(__dirname, '../wechat.db');
const db = new Database(dbPath);

// 生成随机字符串的辅助函数
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成随机 openid
function generateOpenid() {
  return 'openid_' + generateRandomString(20);
}

/**
 * 微信登录
 */
async function wechatLogin(req, res) {
  const { code, userInfo } = req.body;
  
  // 打印请求日志
  console.log(`📱 微信登录 - 方法: ${req.method}, 路径: ${req.path}, Code: ${code}, UserInfo:`, userInfo);

  // 验证参数
  if (!code) {
    return res.status(400).json({
      success: false,
      message: '缺少登录凭证(code)'
    });
  }

  try {
    // 生成随机 openid 和 token
    const openid = generateOpenid();
    
    // 检查 openid 是否存在（在实际微信登录中，这里应该是用微信接口换取真实的 openid）
    // 这里我们模拟直接使用生成的 openid
    const existingUser = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    
    let result;
    if (existingUser) {
      // 存在则更新 token 和用户信息
      const updateStmt = db.prepare(`
        UPDATE users 
        SET nickname = ?, avatar = ?, gender = ?, updated_at = CURRENT_TIMESTAMP
        WHERE openid = ?
      `);
      
      const info = updateStmt.run(
        userInfo?.nickName || existingUser.nickname,
        userInfo?.avatarUrl || existingUser.avatar,
        userInfo?.gender !== undefined ? userInfo.gender : existingUser.gender,
        openid
      );
      
      // 查询更新后的用户信息
      const updatedUser = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
      
      // 生成JWT token
      const token = generateToken(updatedUser);
      
      result = {
        token: token,
        userId: updatedUser.id,
        openid: updatedUser.openid,
        userInfo: {
          nickName: updatedUser.nickname,
          avatarUrl: updatedUser.avatar,
          gender: updatedUser.gender
        }
      };
      
      console.log(`🔄 用户信息已更新: ${updatedUser.nickname || '未知用户'} (ID: ${updatedUser.id})`);
    } else {
      // 不存在则插入新用户
      const insertStmt = db.prepare(`
        INSERT INTO users (openid, nickname, avatar, gender)
        VALUES (?, ?, ?, ?)
      `);
      
      const info = insertStmt.run(
        openid,
        userInfo?.nickName || '匿名用户',
        userInfo?.avatarUrl || '',
        userInfo?.gender !== undefined ? userInfo.gender : 0
      );
      
      // 查询新插入的用户信息
      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      
      // 生成JWT token
      const token = generateToken(newUser);
      
      result = {
        token: token,
        userId: newUser.id,
        openid: newUser.openid,
        userInfo: {
          nickName: newUser.nickname,
          avatarUrl: newUser.avatar,
          gender: newUser.gender
        }
      };
      
      console.log(`🆕 新用户注册: ${newUser.nickname || '匿名用户'} (ID: ${newUser.id})`);
    }

    // 返回成功响应
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('微信登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * QQ登录
 */
async function qqLogin(req, res) {
  const { code, userInfo } = req.body;
  
  // 打印请求日志
  console.log(`📱 QQ登录 - 方法: ${req.method}, 路径: ${req.path}, Code: ${code}, UserInfo:`, userInfo);

  // 验证参数
  if (!code) {
    return res.status(400).json({
      success: false,
      message: '缺少登录凭证(code)'
    });
  }

  try {
    // 生成随机 openid (QQ登录使用不同的前缀)
    const openid = 'qq_' + generateRandomString(20);
    
    // 检查 openid 是否存在
    const existingUser = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    
    let result;
    if (existingUser) {
      // 存在则更新 token 和用户信息
      const updateStmt = db.prepare(`
        UPDATE users 
        SET nickname = ?, avatar = ?, gender = ?, updated_at = CURRENT_TIMESTAMP
        WHERE openid = ?
      `);
      
      const info = updateStmt.run(
        userInfo?.nickName || existingUser.nickname,
        userInfo?.avatarUrl || existingUser.avatar,
        userInfo?.gender !== undefined ? userInfo.gender : existingUser.gender,
        openid
      );
      
      // 查询更新后的用户信息
      const updatedUser = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
      
      // 生成JWT token
      const token = generateToken(updatedUser);
      
      result = {
        token: token,
        userId: updatedUser.id,
        openid: updatedUser.openid,
        userInfo: {
          nickName: updatedUser.nickname,
          avatarUrl: updatedUser.avatar,
          gender: updatedUser.gender
        }
      };
      
      console.log(`🔄 QQ用户信息已更新: ${updatedUser.nickname || '未知用户'} (ID: ${updatedUser.id})`);
    } else {
      // 不存在则插入新用户
      const insertStmt = db.prepare(`
        INSERT INTO users (openid, nickname, avatar, gender)
        VALUES (?, ?, ?, ?)
      `);
      
      const info = insertStmt.run(
        openid,
        userInfo?.nickName || 'QQ用户',
        userInfo?.avatarUrl || '',
        userInfo?.gender !== undefined ? userInfo.gender : 0
      );
      
      // 查询新插入的用户信息
      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      
      // 生成JWT token
      const token = generateToken(newUser);
      
      result = {
        token: token,
        userId: newUser.id,
        openid: newUser.openid,
        userInfo: {
          nickName: newUser.nickname,
          avatarUrl: newUser.avatar,
          gender: newUser.gender
        }
      };
      
      console.log(`🆕 新QQ用户注册: ${newUser.nickname || 'QQ用户'} (ID: ${newUser.id})`);
    }

    // 返回成功响应
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('QQ登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(req, res) {
  // 打印请求日志
  console.log(`👤 获取用户信息 - 方法: ${req.method}, 路径: ${req.path}, 用户: ${req.user.nickname || '未知'}`);

  try {
    // 返回用户完整信息
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        openid: req.user.openid,
        userInfo: {
          nickName: req.user.nickname,
          avatarUrl: req.user.avatar,
          gender: req.user.gender
        },
        createdAt: req.user.created_at,
        updatedAt: req.user.updated_at
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 更新用户信息
 */
async function updateUserInfo(req, res) {
  const { userInfo } = req.body;
  
  // 打印请求日志
  console.log(`✏️ 更新用户信息 - 方法: ${req.method}, 路径: ${req.path}, 用户: ${req.user.nickname || '未知'}, 更新内容:`, userInfo);

  // 验证参数
  if (!userInfo) {
    return res.status(400).json({
      success: false,
      message: '缺少用户信息'
    });
  }

  try {
    // 更新用户信息
    const updateStmt = db.prepare(`
      UPDATE users 
      SET nickname = COALESCE(?, nickname), 
          avatar = COALESCE(?, avatar), 
          gender = COALESCE(?, gender),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const info = updateStmt.run(
      userInfo.nickName,
      userInfo.avatarUrl,
      userInfo.gender,
      req.user.id
    );
    
    res.json({
      success: true,
      message: '更新成功'
    });
    
    console.log(`✅ 用户信息更新成功: ${req.user.nickname || '未知用户'} (ID: ${req.user.id})`);
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 发送短信验证码
 */
async function sendSmsCode(req, res) {
  const { phone, type } = req.body;
  
  // 打印请求日志
  console.log(`📱 发送短信验证码 - 方法: ${req.method}, 路径: ${req.path}, 手机号: ${phone}, 类型: ${type}`);

  // 验证参数
  if (!phone || !type) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数'
    });
  }

  // 验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: '手机号格式不正确'
    });
  }

  // 验证类型
  const validTypes = ['login', 'register', 'bind', 'verify'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: '验证码类型不正确'
    });
  }

  try {
    // 生成6位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 模拟发送成功
    console.log(`发送验证码到 ${phone}: ${code}, 类型: ${type}`);

    res.json({
      success: true,
      message: '验证码发送成功',
      data: {
        phone,
        expiresIn: 300, // 5分钟后过期
        // 仅在开发环境返回验证码
        ...(process.env.NODE_ENV === 'development' && { code })
      }
    });
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 验证短信验证码
 */
async function verifySmsCode(req, res) {
  const { phone, code, type } = req.body;
  
  // 打印请求日志
  console.log(`📱 验证短信验证码 - 方法: ${req.method}, 路径: ${req.path}, 手机号: ${phone}, 验证码: ${code}, 类型: ${type}`);

  // 验证参数
  if (!phone || !code || !type) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数'
    });
  }

  // 验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: '手机号格式不正确'
    });
  }

  // 验证验证码格式
  const codeRegex = /^\d{6}$/;
  if (!codeRegex.test(code)) {
    return res.status(400).json({
      success: false,
      message: '验证码格式不正确'
    });
  }

  // 验证类型
  const validTypes = ['login', 'register', 'bind', 'verify'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: '验证码类型不正确'
    });
  }

  try {
    // 在实际应用中，这里应该从Redis中验证验证码
    // 简化处理，只检查格式
    const isValid = /^\d{6}$/.test(code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: '验证码格式错误'
      });
    }

    // 模拟验证成功
    res.json({
      success: true,
      message: '验证码验证成功',
      data: {
        phone,
        verified: true
      }
    });
  } catch (error) {
    console.error('验证验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

module.exports = {
  wechatLogin,
  qqLogin,
  getUserInfo,
  updateUserInfo,
  sendSmsCode,
  verifySmsCode
};