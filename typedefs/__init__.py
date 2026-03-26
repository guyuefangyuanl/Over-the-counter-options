# -*- coding: utf-8 -*-
"""
项目类型定义模块
提供统一的类型注解，提高代码可维护性和IDE支持
"""

from typing import (
    Dict, List, Optional, Any, Union, Tuple, Callable,
    TypeVar, Generic, TypedDict, Literal, Protocol
)
from datetime import datetime
from bson import ObjectId


# ============================================
# 基础类型别名
# ============================================

# JSON 类型
JSONType = Union[Dict[str, Any], List[Any], str, int, float, bool, None]

# 数据库ID类型
ObjectIdStr = str  # ObjectId 的字符串表示

# 时间类型
Timestamp = Union[datetime, str]

# 分页参数
PageNumber = int
PageSize = int
TotalCount = int


# ============================================
# 用户相关类型
# ============================================

class UserDict(TypedDict, total=False):
    """用户数据字典"""
    _id: str
    openid: str
    nickname: str
    phone: str
    email: str
    avatar: str
    role: str
    balance: float
    createdAt: Timestamp
    updatedAt: Timestamp


class AdminUserDict(TypedDict, total=False):
    """管理员用户数据字典"""
    _id: str
    username: str
    password_hash: str
    role: str
    permissions: List[str]
    lastLoginAt: Timestamp
    createdAt: Timestamp


class JWTPayload(TypedDict, total=False):
    """JWT 载荷"""
    sub: str  # 用户ID
    role: str
    exp: int  # 过期时间
    iat: int  # 签发时间


# ============================================
# 询价相关类型
# ============================================

class InquiryDict(TypedDict, total=False):
    """询价数据字典"""
    _id: str
    userId: str
    openid: str
    productCode: str
    productName: str
    optionType: Literal['call', 'put']
    structure: str
    term: str
    notionalAmount: float
    strikePrice: float
    selectedDealers: List[str]
    contactName: str
    contactPhone: str
    contactEmail: str
    notes: str
    status: str
    isGuest: bool
    source: str
    attachments: List[Dict[str, Any]]
    history: List[Dict[str, Any]]
    createdAt: Timestamp
    updatedAt: Timestamp


InquiryStatusType = Literal[
    'pending',      # 待处理
    'processing',   # 处理中
    'quoted',       # 已报价
    'completed',    # 已成交
    'rejected'      # 已拒绝
]


class InquiryStatistics(TypedDict):
    """询价统计"""
    pending: int
    processing: int
    quoted: int
    completed: int
    rejected: int


# ============================================
# 行情相关类型
# ============================================

class QuoteDict(TypedDict, total=False):
    """行情数据字典"""
    _id: str
    code: str
    name: str
    price: float
    change: float
    changePercent: float
    open: float
    high: float
    low: float
    volume: int
    amount: float
    type: Literal['index', 'stock', 'etf', 'option']
    updateTime: Timestamp


class OptionQuoteDict(TypedDict, total=False):
    """期权行情数据字典"""
    _id: str
    underlying: str
    underlyingName: str
    name: str
    type: Literal['call', 'put']
    strike: float
    expiry: str
    iv: float
    lastPrice: float
    change: float
    volume: int
    updateTime: Timestamp


# ============================================
# 持仓相关类型
# ============================================

class PositionDict(TypedDict, total=False):
    """持仓数据字典"""
    _id: str
    customerId: str
    customerName: str
    productCode: str
    productName: str
    quantity: float
    price: float
    marketValue: float
    profitLoss: float
    status: Literal['active', 'closed']
    closePrice: float
    closeType: str
    closedAt: Timestamp
    createdAt: Timestamp
    updatedAt: Timestamp


# ============================================
# 订单相关类型
# ============================================

class OrderDict(TypedDict, total=False):
    """订单数据字典"""
    _id: str
    customerId: str
    productCode: str
    productName: str
    orderType: Literal['buy', 'sell']
    quantity: float
    price: float
    amount: float
    status: str
    createdAt: Timestamp
    updatedAt: Timestamp


# ============================================
# 消息相关类型
# ============================================

class MessageDict(TypedDict, total=False):
    """消息数据字典"""
    _id: str
    userId: str
    title: str
    content: str
    type: str
    isRead: bool
    readAt: Timestamp
    createdAt: Timestamp


class NotificationDict(TypedDict, total=False):
    """通知数据字典"""
    _id: str
    userId: str
    type: str
    title: str
    content: str
    data: Dict[str, Any]
    isRead: bool
    sentAt: Timestamp


# ============================================
# API 响应类型
# ============================================

class APIResponse(TypedDict):
    """统一API响应格式"""
    success: bool
    message: str
    code: int
    data: Optional[JSONType]


class PaginatedData(TypedDict):
    """分页数据格式"""
    items: List[Any]
    pagination: 'PaginationInfo'


class PaginationInfo(TypedDict):
    """分页信息"""
    page: int
    per_page: int
    total: int
    pages: int


class ErrorResponse(TypedDict):
    """错误响应"""
    success: Literal[False]
    message: str
    code: int
    error_code: Optional[int]
    data: Optional[Dict[str, Any]]


# ============================================
# 请求参数类型
# ============================================

class InquirySubmitParams(TypedDict, total=False):
    """询价提交参数"""
    productCode: str
    productName: str
    optionType: str
    structure: str
    term: str
    notionalAmount: float
    strikePrice: float
    selectedDealers: List[str]
    contactName: str
    contactPhone: str
    contactEmail: str
    notes: str


class PaginationParams(TypedDict, total=False):
    """分页参数"""
    page: int
    pageSize: int
    status: Optional[str]


class LoginParams(TypedDict):
    """登录参数"""
    username: str
    password: str


# ============================================
# 函数类型
# ============================================

# 路由处理函数
RouteHandler = Callable[..., Tuple[Any, int]]

# 中间件函数
MiddlewareFunc = Callable[[Any], Any]

# 验证函数
ValidatorFunc = Callable[[Any], Tuple[bool, Optional[str]]]

# 数据转换函数
TransformFunc = Callable[[Dict[str, Any]], Dict[str, Any]]


# ============================================
# 泛型类型
# ============================================

T = TypeVar('T')


class Result(Generic[T]):
    """结果类型（类似 Rust 的 Result）"""
    
    def __init__(self, success: bool, data: T = None, error: str = None):
        self.success = success
        self.data = data
        self.error = error
    
    @classmethod
    def ok(cls, data: T) -> 'Result[T]':
        return cls(True, data=data)
    
    @classmethod
    def err(cls, error: str) -> 'Result[T]':
        return cls(False, error=error)
    
    def is_ok(self) -> bool:
        return self.success
    
    def is_err(self) -> bool:
        return not self.success
    
    def unwrap(self) -> T:
        if not self.success:
            raise ValueError(f"Cannot unwrap error: {self.error}")
        return self.data


# ============================================
# 协议类型（用于类型检查）
# ============================================

class ModelProtocol(Protocol):
    """数据模型协议"""
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        ...
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ModelProtocol':
        """从字典创建"""
        ...


class ServiceProtocol(Protocol):
    """服务协议"""
    
    def create(self, data: Dict[str, Any]) -> str:
        """创建记录"""
        ...
    
    def get_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        """根据ID获取"""
        ...
    
    def update(self, id: str, data: Dict[str, Any]) -> bool:
        """更新记录"""
        ...
    
    def delete(self, id: str) -> bool:
        """删除记录"""
        ...