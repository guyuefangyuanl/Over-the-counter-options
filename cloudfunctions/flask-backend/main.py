import json
import os
from app import app

def handler(event, context):
    """云函数入口函数 - 支持HTTP网关触发"""
    print(f"Received event: {event}")
    print(f"Context: {context}")
    
    # 处理HTTP网关触发
    if 'requestContext' in event:
        # API网关触发
        request_context = event['requestContext']
        http_method = request_context.get('httpMethod', 'GET')
        path = request_context.get('path', '/')
        headers = event.get('headers', {})
        body = event.get('body', '')
        
        # 解析请求体
        if body and isinstance(body, str):
            try:
                if headers.get('content-type', '').startswith('application/json'):
                    body = json.loads(body)
            except:
                pass
        
        # 使用Flask测试客户端处理请求
        with app.test_client() as client:
            # 设置环境变量供Flask使用
            os.environ['SERVERLESS'] = 'true'
            
            # 发送请求到Flask应用
            if http_method == 'GET':
                response = client.get(path, headers=headers)
            elif http_method == 'POST':
                response = client.post(path, json=body, headers=headers)
            elif http_method == 'PUT':
                response = client.put(path, json=body, headers=headers)
            elif http_method == 'DELETE':
                response = client.delete(path, headers=headers)
            else:
                response = client.open(path, method=http_method, json=body, headers=headers)
            
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
    
    # 处理定时触发器或其他事件
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Flask backend is running!',
            'event': event
        })
    }