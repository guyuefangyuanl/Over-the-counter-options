const http = require('http');

// 测试微信登录接口
const testLogin = () => {
  const postData = JSON.stringify({
    code: 'test_code',
    userInfo: {
      nickName: '测试用户',
      avatarUrl: '',
      gender: 1
    }
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/wechat/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`状态码: ${res.statusCode}`);
    
    res.on('data', (d) => {
      console.log('响应数据:', d.toString());
    });
  });

  req.on('error', (error) => {
    console.error('请求错误:', error);
  });

  req.write(postData);
  req.end();
};

// 运行测试
testLogin();