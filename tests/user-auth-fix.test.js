/**
 * 用户账户互动功能修复测试
 * 测试范围：登录、Token刷新、用户信息获取、API超时处理
 */

const auth = require('../utils/auth');
const request = require('../utils/request');

// 模拟wx API
const mockWxApi = () => {
  global.wx = {
    login: jest.fn(),
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    request: jest.fn(),
    checkSession: jest.fn(),
    getAccountInfoSync: jest.fn(),
    showToast: jest.fn(),
    switchTab: jest.fn(),
    reLaunch: jest.fn(),
    getCurrentPages: jest.fn(() => []),
    showModal: jest.fn()
  };
};

describe('用户认证功能修复测试', () => {
  beforeEach(() => {
    mockWxApi();
    jest.clearAllMocks();
  });

  describe('1. 微信登录功能测试', () => {
    test('登录成功 - 正确解析后端响应', async () => {
      const mockCode = 'mock_code_12345';
      const mockResponse = {
        success: true,
        message: '登录成功',
        data: {
          access_token: 'test_access_token_123',
          refresh_token: 'test_refresh_token_456',
          expires_in: 900,
          openid: 'test_openid_789',
          nickname: '测试用户',
          avatar: 'https://example.com/avatar.jpg'
        }
      };

      // 模拟wx.login成功
      wx.login.mockImplementation(({ success }) => {
        success({ code: mockCode });
      });

      // 模拟request.post成功
      request.post = jest.fn().mockResolvedValue(mockResponse);

      const result = await auth.login();

      expect(result.success).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('token', 'test_access_token_123');
      expect(wx.setStorageSync).toHaveBeenCalledWith('refresh_token', 'test_refresh_token_456');
    });

    test('登录失败 - 后端返回错误', async () => {
      const mockResponse = {
        success: false,
        message: '微信code无效'
      };

      wx.login.mockImplementation(({ success }) => {
        success({ code: 'invalid_code' });
      });

      request.post = jest.fn().mockResolvedValue(mockResponse);

      await expect(auth.login()).rejects.toThrow('微信code无效');
    });

    test('登录失败 - wx.login失败', async () => {
      wx.login.mockImplementation(({ fail }) => {
        fail({ errMsg: 'login:fail' });
      });

      await expect(auth.login()).rejects.toThrow('微信登录调用失败');
    });

    test('登录响应格式兼容 - 字符串响应', async () => {
      const mockResponse = JSON.stringify({
        success: true,
        data: {
          access_token: 'token_from_string',
          openid: 'test_openid'
        }
      });

      wx.login.mockImplementation(({ success }) => {
        success({ code: 'test_code' });
      });

      request.post = jest.fn().mockResolvedValue(mockResponse);

      const result = await auth.login();
      expect(result.success).toBe(true);
    });
  });

  describe('2. Token刷新功能测试', () => {
    test('Token刷新成功', async () => {
      const mockRefreshToken = 'test_refresh_token';
      const mockNewToken = 'new_access_token';

      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'refresh_token') return mockRefreshToken;
        return null;
      });

      wx.request.mockImplementation(({ success }) => {
        success({
          statusCode: 200,
          data: {
            success: true,
            data: {
              access_token: mockNewToken,
              refresh_token: 'new_refresh_token',
              expires_in: 900
            }
          }
        });
      });

      const result = await auth.refreshAccessToken();
      expect(result).toBe(mockNewToken);
      expect(wx.setStorageSync).toHaveBeenCalledWith('token', mockNewToken);
    });

    test('Token刷新失败 - 无refresh_token', async () => {
      wx.getStorageSync.mockReturnValue(null);

      await expect(auth.refreshAccessToken()).rejects.toThrow('未找到刷新令牌');
    });

    test('Token刷新失败 - 后端返回错误', async () => {
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'refresh_token') return 'invalid_token';
        return null;
      });

      wx.request.mockImplementation(({ success }) => {
        success({
          statusCode: 401,
          data: {
            success: false,
            message: 'Refresh token已过期'
          }
        });
      });

      await expect(auth.refreshAccessToken()).rejects.toThrow('Refresh token已过期');
    });
  });

  describe('3. 会话管理测试', () => {
    test('检查会话 - 已登录且有效', async () => {
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'token') return 'valid_token';
        if (key === 'userInfo') return { isLoggedIn: true };
        return null;
      });

      wx.checkSession.mockImplementation(({ success }) => {
        success();
      });

      const result = await auth.checkSession();
      expect(result).toBe(true);
    });

    test('检查会话 - 未登录', async () => {
      wx.getStorageSync.mockReturnValue(null);

      const result = await auth.checkSession();
      expect(result).toBe(false);
    });

    test('检查会话 - Token过期', async () => {
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'token') return 'expired_token';
        if (key === 'userInfo') return { 
          isLoggedIn: true,
          tokenExpiry: Date.now() - 1000 // 已过期
        };
        if (key === 'refresh_token') return null;
        return null;
      });

      const result = await auth.checkSession();
      expect(result).toBe(false);
    });

    test('退出登录', () => {
      auth.logout();

      expect(wx.removeStorageSync).toHaveBeenCalledWith('token');
      expect(wx.removeStorageSync).toHaveBeenCalledWith('refresh_token');
      expect(wx.removeStorageSync).toHaveBeenCalledWith('userInfo');
      expect(wx.reLaunch).toHaveBeenCalledWith({
        url: '/pages/login/login'
      });
    });
  });

  describe('4. API请求超时处理测试', () => {
    test('GET请求带超时选项', async () => {
      const mockResponse = { data: 'test' };
      
      wx.request.mockImplementation(({ success }) => {
        success({
          statusCode: 200,
          data: { success: true, data: mockResponse }
        });
      });

      const result = await request.get('/test', {}, {}, { timeout: 5000 });
      expect(result).toEqual(mockResponse);
    });

    test('请求超时错误处理', async () => {
      wx.request.mockImplementation(({ fail }) => {
        fail({ errMsg: 'request:fail timeout' });
      });

      await expect(request.get('/test')).rejects.toThrow('请求超时');
    });

    test('网络连接失败处理', async () => {
      wx.request.mockImplementation(({ fail }) => {
        fail({ errMsg: 'request:fail' });
      });

      await expect(request.get('/test')).rejects.toThrow('网络连接失败');
    });

    test('401错误自动刷新Token', async () => {
      let callCount = 0;
      
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'token') return 'old_token';
        if (key === 'refresh_token') return 'refresh_token';
        return null;
      });

      wx.request.mockImplementation(({ success }) => {
        callCount++;
        if (callCount === 1) {
          // 第一次返回401
          success({ statusCode: 401, data: {} });
        } else if (callCount === 2) {
          // 刷新Token请求
          success({
            statusCode: 200,
            data: {
              success: true,
              data: { access_token: 'new_token' }
            }
          });
        } else {
          // 重试原请求
          success({
            statusCode: 200,
            data: { success: true, data: 'success_after_refresh' }
          });
        }
      });

      const result = await request.get('/test');
      expect(result).toBe('success_after_refresh');
    });
  });

  describe('5. 用户信息获取测试', () => {
    test('获取当前用户', () => {
      const mockUser = { nickname: '测试用户', openid: 'test123' };
      wx.getStorageSync.mockReturnValue(mockUser);

      const user = auth.getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    test('获取Token', () => {
      wx.getStorageSync.mockReturnValue('test_token');

      const token = auth.getToken();
      expect(token).toBe('test_token');
    });
  });
});

// 运行测试
if (require.main === module) {
  console.log('运行用户认证功能修复测试...');
  console.log('注意：这些测试需要Jest环境才能运行');
  console.log('运行命令: npm test -- tests/user-auth-fix.test.js');
}

module.exports = {
  mockWxApi
};
