"""
Swagger API文档配置

提供统一的API文档配置和模板
"""

# Swagger配置
SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'apispec',
            "route": '/apispec.json',
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs"
}

# Swagger模板
SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "场外期权交易系统 API",
        "description": """
## 概述
场外期权交易系统后端API文档，提供用户管理、询价管理、交易管理等功能。

## 认证方式
使用JWT Bearer Token认证，在请求头中添加：
```
Authorization: Bearer <token>
```

## 响应格式
所有接口返回统一的JSON格式：
```json
{
    "success": true,
    "code": 0,
    "message": "操作成功",
    "data": {...}
}
```

## 错误码说明
| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权/Token失效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
        """,
        "contact": {
            "name": "API Support",
            "email": "support@example.com"
        },
        "version": "1.0.0"
    },
    "host": "localhost:5000",
    "basePath": "/",
    "schemes": [
        "http",
        "https"
    ],
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "JWT认证令牌，格式: Bearer <token>"
        }
    },
    "definitions": {
        "ApiResponse": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "description": "请求是否成功"
                },
                "code": {
                    "type": "integer",
                    "description": "状态码"
                },
                "message": {
                    "type": "string",
                    "description": "响应消息"
                },
                "data": {
                    "type": "object",
                    "description": "响应数据"
                }
            }
        },
        "Inquiry": {
            "type": "object",
            "properties": {
                "_id": {
                    "type": "string",
                    "description": "询价ID"
                },
                "productName": {
                    "type": "string",
                    "description": "产品名称"
                },
                "underlyingCode": {
                    "type": "string",
                    "description": "标的代码"
                },
                "underlyingName": {
                    "type": "string",
                    "description": "标的名称"
                },
                "notionalAmount": {
                    "type": "number",
                    "description": "名义本金"
                },
                "strikePrice": {
                    "type": "number",
                    "description": "行权价（百分比）"
                },
                "term": {
                    "type": "string",
                    "description": "期限"
                },
                "optionType": {
                    "type": "string",
                    "enum": ["call", "put"],
                    "description": "期权类型"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "processing", "quoted", "accepted", "rejected", "expired"],
                    "description": "状态"
                },
                "phone": {
                    "type": "string",
                    "description": "联系电话"
                },
                "createdAt": {
                    "type": "string",
                    "format": "date-time",
                    "description": "创建时间"
                }
            }
        },
        "Quote": {
            "type": "object",
            "properties": {
                "inquiryId": {
                    "type": "string",
                    "description": "询价ID"
                },
                "premium": {
                    "type": "number",
                    "description": "期权费"
                },
                "premiumRate": {
                    "type": "number",
                    "description": "期权费率"
                },
                "dealerName": {
                    "type": "string",
                    "description": "券商名称"
                },
                "validUntil": {
                    "type": "string",
                    "format": "date-time",
                    "description": "报价有效期"
                }
            }
        },
        "User": {
            "type": "object",
            "properties": {
                "_id": {
                    "type": "string",
                    "description": "用户ID"
                },
                "openid": {
                    "type": "string",
                    "description": "微信OpenID"
                },
                "nickname": {
                    "type": "string",
                    "description": "昵称"
                },
                "phone": {
                    "type": "string",
                    "description": "手机号"
                },
                "role": {
                    "type": "string",
                    "enum": ["user", "dealer", "admin"],
                    "description": "角色"
                }
            }
        },
        "Error": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "example": False
                },
                "code": {
                    "type": "integer",
                    "example": 400
                },
                "message": {
                    "type": "string",
                    "example": "参数错误"
                },
                "errors": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            }
        }
    }
}

# 认证相关API文档模板
AUTH_APIS = {
    "login": {
        "tags": ["认证"],
        "summary": "用户登录",
        "description": "通过微信授权码登录系统",
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "微信授权码"
                        }
                    },
                    "required": ["code"]
                }
            }
        ],
        "responses": {
            "200": {
                "description": "登录成功",
                "schema": {
                    "$ref": "#/definitions/ApiResponse"
                }
            },
            "401": {
                "description": "认证失败",
                "schema": {
                    "$ref": "#/definitions/Error"
                }
            }
        }
    }
}

# 询价相关API文档模板
INQUIRY_APIS = {
    "create_inquiry": {
        "tags": ["询价"],
        "summary": "创建询价",
        "description": "提交新的期权询价请求",
        "security": [{"Bearer": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "$ref": "#/definitions/Inquiry"
                }
            }
        ],
        "responses": {
            "201": {
                "description": "创建成功",
                "schema": {
                    "$ref": "#/definitions/ApiResponse"
                }
            },
            "400": {
                "description": "参数错误",
                "schema": {
                    "$ref": "#/definitions/Error"
                }
            }
        }
    },
    "list_inquiries": {
        "tags": ["询价"],
        "summary": "获取询价列表",
        "description": "查询询价列表，支持分页和筛选",
        "security": [{"Bearer": []}],
        "parameters": [
            {
                "name": "page",
                "in": "query",
                "type": "integer",
                "default": 1,
                "description": "页码"
            },
            {
                "name": "page_size",
                "in": "query",
                "type": "integer",
                "default": 20,
                "description": "每页数量"
            },
            {
                "name": "status",
                "in": "query",
                "type": "string",
                "description": "状态筛选"
            }
        ],
        "responses": {
            "200": {
                "description": "查询成功",
                "schema": {
                    "type": "object",
                    "properties": {
                        "success": {"type": "boolean"},
                        "data": {
                            "type": "object",
                            "properties": {
                                "items": {
                                    "type": "array",
                                    "items": {"$ref": "#/definitions/Inquiry"}
                                },
                                "total": {"type": "integer"},
                                "page": {"type": "integer"},
                                "page_size": {"type": "integer"}
                            }
                        }
                    }
                }
            }
        }
    }
}


def init_swagger(app):
    """
    初始化Swagger

    Args:
        app: Flask应用实例
    """
    from flasgger import Swagger

    swagger = Swagger(
        app,
        config=SWAGGER_CONFIG,
        template=SWAGGER_TEMPLATE
    )

    return swagger


def get_api_doc(api_name: str, api_type: str = "inquiry") -> dict:
    """
    获取API文档模板

    Args:
        api_name: API名称
        api_type: API类型 (auth, inquiry, etc.)

    Returns:
        API文档字典
    """
    apis_map = {
        "auth": AUTH_APIS,
        "inquiry": INQUIRY_APIS
    }

    apis = apis_map.get(api_type, {})
    return apis.get(api_name, {})