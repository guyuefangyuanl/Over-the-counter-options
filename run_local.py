import os
import sys

# 设置环境变量
os.environ['NODE_ENV'] = 'development'
os.environ['FLASK_ENV'] = 'development'

# 添加当前目录到 Python 路径
sys.path.insert(0, '.')

# 导入并运行应用
from app import app

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)