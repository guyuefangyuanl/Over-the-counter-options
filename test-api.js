const http = require('http');

// 测试测试接口
const testApi = () => {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/test',
    method: 'GET'
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

  req.end();
};

// 运行测试
testApi();