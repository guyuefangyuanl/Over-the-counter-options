"""
询价状态定义和状态机
统一管理询价状态，确保前后端一致性
"""
from enum import Enum
from typing import Set, Dict, Optional


class InquiryStatus(str, Enum):
    """询价状态枚举"""
    PENDING = "pending"        # 待处理（初始状态）
    PROCESSING = "processing"  # 处理中
    QUOTED = "quoted"          # 已报价
    COMPLETED = "completed"    # 已成交
    REJECTED = "rejected"      # 已拒绝

    @classmethod
    def get_label(cls, status: str) -> str:
        """获取状态的中文标签"""
        labels = {
            cls.PENDING.value: "待处理",
            cls.PROCESSING.value: "处理中",
            cls.QUOTED.value: "已报价",
            cls.COMPLETED.value: "已成交",
            cls.REJECTED.value: "已拒绝",
        }
        return labels.get(status, status or "--")

    @classmethod
    def get_color(cls, status: str) -> str:
        """获取状态的显示颜色"""
        colors = {
            cls.PENDING.value: "#E6A23C",     # 橙色
            cls.PROCESSING.value: "#409EFF",  # 蓝色
            cls.QUOTED.value: "#409EFF",      # 蓝色
            cls.COMPLETED.value: "#67C23A",   # 绿色
            cls.REJECTED.value: "#F56C6C",    # 红色
        }
        return colors.get(status, "#909399")  # 默认灰色

    @classmethod
    def all_values(cls) -> Set[str]:
        """获取所有状态值"""
        return {s.value for s in cls}

    @classmethod
    def active_values(cls) -> Set[str]:
        """获取活跃状态（非终态）"""
        return {cls.PENDING.value, cls.PROCESSING.value, cls.QUOTED.value}

    @classmethod
    def terminal_values(cls) -> Set[str]:
        """获取终态状态"""
        return {cls.COMPLETED.value, cls.REJECTED.value}


class InquiryStatusMachine:
    """询价状态机，管理状态流转"""

    # 定义合法的状态转换
    # 格式: {当前状态: {允许转换的目标状态集合}}
    VALID_TRANSITIONS: Dict[str, Set[str]] = {
        InquiryStatus.PENDING.value: {
            InquiryStatus.PROCESSING.value,
            InquiryStatus.QUOTED.value,
            InquiryStatus.REJECTED.value,
        },
        InquiryStatus.PROCESSING.value: {
            InquiryStatus.QUOTED.value,
            InquiryStatus.COMPLETED.value,
            InquiryStatus.REJECTED.value,
        },
        InquiryStatus.QUOTED.value: {
            InquiryStatus.COMPLETED.value,
            InquiryStatus.REJECTED.value,
        },
        InquiryStatus.COMPLETED.value: set(),  # 终态，不可转换
        InquiryStatus.REJECTED.value: set(),   # 终态，不可转换
    }

    @classmethod
    def can_transition(cls, from_status: str, to_status: str) -> bool:
        """
        检查状态转换是否合法

        Args:
            from_status: 当前状态
            to_status: 目标状态

        Returns:
            是否允许转换
        """
        # 如果当前状态不在定义中，允许任意转换（兼容历史数据）
        if from_status not in cls.VALID_TRANSITIONS:
            return True

        allowed = cls.VALID_TRANSITIONS.get(from_status, set())
        return to_status in allowed

    @classmethod
    def get_allowed_transitions(cls, current_status: str) -> Set[str]:
        """
        获取当前状态允许转换的目标状态

        Args:
            current_status: 当前状态

        Returns:
            允许转换的状态集合
        """
        return cls.VALID_TRANSITIONS.get(current_status, set())

    @classmethod
    def validate_transition(cls, from_status: str, to_status: str) -> Optional[str]:
        """
        验证状态转换，返回错误信息（如果无效）

        Args:
            from_status: 当前状态
            to_status: 目标状态

        Returns:
            错误信息，如果转换合法则返回 None
        """
        # 检查目标状态是否有效
        if to_status not in InquiryStatus.all_values():
            return f"无效的目标状态: {to_status}"

        # 检查状态转换是否合法
        if not cls.can_transition(from_status, to_status):
            allowed = cls.get_allowed_transitions(from_status)
            allowed_labels = [InquiryStatus.get_label(s) for s in allowed]
            return f"状态'{InquiryStatus.get_label(from_status)}'不能转换为'{InquiryStatus.get_label(to_status)}'，允许的转换: {', '.join(allowed_labels) or '无'}"

        return None


# 导出常量
INQUIRY_STATUS_VALUES = InquiryStatus.all_values()
INQUIRY_STATUS_TERMINAL = InquiryStatus.terminal_values()
INQUIRY_STATUS_ACTIVE = InquiryStatus.active_values()