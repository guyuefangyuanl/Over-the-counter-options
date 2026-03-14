import json
from flask import Flask, jsonify
from flask_cors import CORS

# 创建简单的Flask应用
app = Flask(__name__)
CORS(app)

@app.route('/api/v1/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Flask backend is running successfully!',
        'timestamp': '2026-03-14'
    })

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'Welcome to Flask Backend API',
        'version': '1.0.0'
    })

@app.route('/test', methods=['GET'])
def test():
    return jsonify({
        'message': 'Test endpoint working!'
    })

def handler(event, context):
    """云函数入口函数"""
    print(f"Received event: {event}")
    print(f"Context: {context}")
    
    # 处理HTTP网关触发
    if 'requestContext' in event:
        request_context = event['requestContext']
        http_method = request_context.get('httpMethod', 'GET')
        # 获取完整的路径，包括前缀
        full_path = event.get('path', '/')
        # 移除API网关前缀，保留实际的Flask路由路径
        path = full_path.replace('/test-api', '') or '/'
        
        headers = event.get('headers', {})
        
        print(f"Original path: {full_path}")
        print(f"Processed path: {path}")
        print(f"Processing request: {http_method} {path}")
        
        # 使用Flask测试客户端处理请求
        with app.test_client() as client:
            if http_method == 'GET':
                response = client.get(path, headers=headers)
            else:
                response = client.open(path, method=http_method, headers=headers)
            
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.get_data(as_text=True)}")
            
            # 构造API网关响应格式
            return {
                'isBase64Encoded': False,
                'statusCode': response.status_code,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                'body': response.get_data(as_text=True)
            }
    
    # 处理其他事件
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Flask backend is running!',
            'event': event
        })
    }