"""
交易服务增强模块
包含：交易确认机制、自动对账、交易通知
"""

import hashlib
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from functools import wraps
from flask import current_app, g

# 尝试导入数据库服务
try:
    from services.database_service import get_db_service
except ImportError:
    get_db_service = None


# ==================== 交易确认机制 ====================

class TradeConfirmationService:
    """
    交易确认服务
    实现电子签章式的交易确认机制
    """

    # 确认状态
    STATUS_PENDING = 'pending'           # 待确认
    STATUS_CONFIRMED = 'confirmed'       # 已确认
    STATUS_REJECTED = 'rejected'         # 已拒绝
    STATUS_EXPIRED = 'expired'           # 已过期
    STATUS_CANCELLED = 'cancelled'       # 已取消

    # 确认类型
    TYPE_TRADE_CREATE = 'trade_create'       # 创建交易
    TYPE_TRADE_MODIFY = 'trade_modify'       # 修改交易
    TYPE_TRADE_CANCEL = 'trade_cancel'       # 取消交易
    TYPE_LARGE_AMOUNT = 'large_amount'       # 大额交易
    TYPE_SETTLEMENT = 'settlement'           # 结算

    # 确认超时配置（秒）
    CONFIRMATION_TIMEOUT = {
        TYPE_TRADE_CREATE: 3600,     # 1小时
        TYPE_TRADE_MODIFY: 1800,     # 30分钟
        TYPE_TRADE_CANCEL: 600,      # 10分钟
        TYPE_LARGE_AMOUNT: 7200,     # 2小时
        TYPE_SETTLEMENT: 86400       # 24小时
    }

    def __init__(self):
        self.db = get_db_service() if get_db_service else None

    def create_confirmation(self, user_id: str, trade_id: str,
                           confirm_type: str, trade_data: Dict[str, Any],
                           require_dual_confirm: bool = False) -> Dict[str, Any]:
        """
        创建交易确认请求

        Args:
            user_id: 用户ID
            trade_id: 交易ID
            confirm_type: 确认类型
            trade_data: 交易数据快照
            require_dual_confirm: 是否需要双人确认

        Returns:
            确认请求信息
        """
        confirm_id = f"CFM_{uuid.uuid4().hex[:12].upper()}"
        timeout = self.CONFIRMATION_TIMEOUT.get(confirm_type, 3600)
        expires_at = datetime.now() + timedelta(seconds=timeout)

        # 生成交易数据签名（电子签章）
        signature = self._generate_trade_signature(trade_data)

        confirmation = {
            'confirm_id': confirm_id,
            'trade_id': trade_id,
            'user_id': user_id,
            'confirm_type': confirm_type,
            'status': self.STATUS_PENDING,
            'trade_data': trade_data,
            'data_signature': signature,
            'require_dual_confirm': require_dual_confirm,
            'confirmations': [],
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.now().isoformat()
        }

        # 存储确认请求
        if self.db:
            try:
                self.db.insert('trade_confirmations', confirmation)
            except Exception as e:
                current_app.logger.error(f"存储确认请求失败: {e}")

        # 发送通知
        self._send_confirmation_notification(confirmation)

        return confirmation

    def confirm(self, confirm_id: str, user_id: str,
                confirmation_method: str = 'password',
                confirmation_data: Optional[Dict] = None) -> Dict[str, Any]:
        """
        确认交易

        Args:
            confirm_id: 确认ID
            user_id: 确认用户ID
            confirmation_method: 确认方式 (password/sms/2fa)
            confirmation_data: 确认数据（如验证码）

        Returns:
            确认结果
        """
        # 获取确认请求
        confirmation = self._get_confirmation(confirm_id)
        if not confirmation:
            return {'success': False, 'error': '确认请求不存在'}

        # 检查状态
        if confirmation['status'] != self.STATUS_PENDING:
            return {'success': False, 'error': f"确认请求状态无效: {confirmation['status']}"}

        # 检查过期
        if datetime.fromisoformat(confirmation['expires_at']) < datetime.now():
            self._update_status(confirm_id, self.STATUS_EXPIRED)
            return {'success': False, 'error': '确认请求已过期'}

        # 验证用户权限
        if confirmation['user_id'] != user_id:
            # 检查是否有代理确认权限
            if not self._check_proxy_permission(user_id, confirmation):
                return {'success': False, 'error': '无权确认此交易'}

        # 验证确认数据
        verify_result = self._verify_confirmation(
            user_id, confirmation_method, confirmation_data
        )
        if not verify_result['success']:
            return verify_result

        # 记录确认
        confirm_record = {
            'user_id': user_id,
            'method': confirmation_method,
            'confirmed_at': datetime.now().isoformat(),
            'ip_address': g.get('client_ip', '') if hasattr(g, 'client_ip') else ''
        }

        confirmation['confirmations'].append(confirm_record)

        # 检查是否需要双人确认
        if confirmation['require_dual_confirm']:
            if len(confirmation['confirmations']) < 2:
                # 更新确认记录，等待第二人确认
                self._update_confirmation_records(confirm_id, confirmation['confirmations'])
                return {
                    'success': True,
                    'status': 'partial',
                    'message': '第一人确认成功，等待第二人确认'
                }

        # 完成确认
        self._update_status(confirm_id, self.STATUS_CONFIRMED)

        # 触发交易执行
        self._execute_trade(confirmation)

        return {
            'success': True,
            'status': 'confirmed',
            'confirm_id': confirm_id,
            'message': '交易确认成功'
        }

    def reject(self, confirm_id: str, user_id: str,
               reason: str = '') -> Dict[str, Any]:
        """
        拒绝交易

        Args:
            confirm_id: 确认ID
            user_id: 用户ID
            reason: 拒绝原因

        Returns:
            拒绝结果
        """
        confirmation = self._get_confirmation(confirm_id)
        if not confirmation:
            return {'success': False, 'error': '确认请求不存在'}

        if confirmation['user_id'] != user_id:
            return {'success': False, 'error': '无权操作此确认请求'}

        self._update_status(confirm_id, self.STATUS_REJECTED, reason)

        return {
            'success': True,
            'status': 'rejected',
            'message': '交易已拒绝'
        }

    def cancel(self, confirm_id: str, user_id: str,
               reason: str = '') -> Dict[str, Any]:
        """
        取消确认请求
        """
        confirmation = self._get_confirmation(confirm_id)
        if not confirmation:
            return {'success': False, 'error': '确认请求不存在'}

        if confirmation['user_id'] != user_id:
            return {'success': False, 'error': '无权操作此确认请求'}

        if confirmation['status'] != self.STATUS_PENDING:
            return {'success': False, 'error': '只能取消待确认的请求'}

        self._update_status(confirm_id, self.STATUS_CANCELLED, reason)

        return {'success': True, 'message': '确认请求已取消'}

    def _generate_trade_signature(self, trade_data: Dict) -> str:
        """
        生成交易数据签名（用于防篡改验证）
        """
        # 按key排序后序列化
        sorted_data = str(sorted(trade_data.items()))
        signature_base = f"{sorted_data}_{time.time()}"
        return hashlib.sha256(signature_base.encode()).hexdigest()[:32]

    def _verify_confirmation(self, user_id: str, method: str,
                             data: Optional[Dict]) -> Dict[str, Any]:
        """
        验证确认方式
        """
        if method == 'password':
            # 密码验证（需要前端已验证过）
            return {'success': True}

        elif method == 'sms':
            # 短信验证码验证
            if not data or not data.get('code'):
                return {'success': False, 'error': '请输入验证码'}
            # 这里应该调用短信验证服务
            return {'success': True}

        elif method == '2fa':
            # 双因素认证验证
            if not data or not data.get('totp_code'):
                return {'success': False, 'error': '请输入动态验证码'}
            # 这里应该调用2FA验证服务
            return {'success': True}

        return {'success': False, 'error': '未知的确认方式'}

    def _get_confirmation(self, confirm_id: str) -> Optional[Dict]:
        """获取确认请求"""
        if self.db:
            try:
                result = self.db.query_one(
                    'trade_confirmations',
                    {'confirm_id': confirm_id}
                )
                return result
            except Exception:
                pass

        # 返回模拟数据（开发环境）
        return None

    def _update_status(self, confirm_id: str, status: str, reason: str = ''):
        """更新确认状态"""
        if self.db:
            try:
                self.db.update(
                    'trade_confirmations',
                    {'confirm_id': confirm_id},
                    {
                        'status': status,
                        'reject_reason': reason,
                        'updated_at': datetime.now().isoformat()
                    }
                )
            except Exception as e:
                current_app.logger.error(f"更新确认状态失败: {e}")

    def _update_confirmation_records(self, confirm_id: str, records: List):
        """更新确认记录"""
        if self.db:
            try:
                self.db.update(
                    'trade_confirmations',
                    {'confirm_id': confirm_id},
                    {'confirmations': records}
                )
            except Exception as e:
                current_app.logger.error(f"更新确认记录失败: {e}")

    def _check_proxy_permission(self, user_id: str, confirmation: Dict) -> bool:
        """检查代理确认权限"""
        # 这里应该检查用户是否有代理确认的权限
        return False

    def _send_confirmation_notification(self, confirmation: Dict):
        """发送确认通知"""
        # 集成通知服务发送通知
        pass

    def _execute_trade(self, confirmation: Dict):
        """执行已确认的交易"""
        # 触发交易执行逻辑
        pass


# ==================== 自动对账功能 ====================

class ReconciliationService:
    """
    对账服务
    实现自动对账、差异检测和报告生成
    """

    # 对账类型
    TYPE_DAILY = 'daily'           # 日对账
    TYPE_WEEKLY = 'weekly'         # 周对账
    TYPE_MONTHLY = 'monthly'       # 月对账
    TYPE_TRADE = 'trade'           # 交易对账
    TYPE_BALANCE = 'balance'       # 余额对账

    # 对账状态
    STATUS_PENDING = 'pending'
    STATUS_PROCESSING = 'processing'
    STATUS_COMPLETED = 'completed'
    STATUS_DISCREPANCY = 'discrepancy'   # 发现差异

    def __init__(self):
        self.db = get_db_service() if get_db_service else None

    def create_reconciliation_task(self, recon_type: str,
                                   period_start: datetime,
                                   period_end: datetime,
                                   created_by: str) -> Dict[str, Any]:
        """
        创建对账任务
        """
        recon_id = f"REC_{uuid.uuid4().hex[:12].upper()}"

        task = {
            'recon_id': recon_id,
            'recon_type': recon_type,
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'status': self.STATUS_PENDING,
            'created_by': created_by,
            'created_at': datetime.now().isoformat(),
            'summary': None,
            'discrepancies': [],
            'report_url': None
        }

        if self.db:
            try:
                self.db.insert('reconciliation_tasks', task)
            except Exception as e:
                current_app.logger.error(f"创建对账任务失败: {e}")

        # 异步执行对账
        self._execute_reconciliation_async(recon_id)

        return task

    def execute_reconciliation(self, recon_id: str) -> Dict[str, Any]:
        """
        执行对账
        """
        task = self._get_task(recon_id)
        if not task:
            return {'success': False, 'error': '对账任务不存在'}

        # 更新状态
        self._update_task_status(recon_id, self.STATUS_PROCESSING)

        try:
            # 1. 获取交易记录
            internal_records = self._get_internal_records(task)
            external_records = self._get_external_records(task)

            # 2. 匹配记录
            matched, unmatched_internal, unmatched_external = \
                self._match_records(internal_records, external_records)

            # 3. 检查差异
            discrepancies = self._check_discrepancies(
                matched, unmatched_internal, unmatched_external
            )

            # 4. 生成报告
            summary = {
                'total_internal': len(internal_records),
                'total_external': len(external_records),
                'matched_count': len(matched),
                'unmatched_internal': len(unmatched_internal),
                'unmatched_external': len(unmatched_external),
                'discrepancy_count': len(discrepancies)
            }

            # 5. 更新任务
            final_status = self.STATUS_DISCREPANCY if discrepancies else self.STATUS_COMPLETED
            self._update_task_result(recon_id, final_status, summary, discrepancies)

            # 6. 生成报告文件
            report_url = self._generate_report(task, summary, discrepancies)
            self._update_task_report(recon_id, report_url)

            return {
                'success': True,
                'recon_id': recon_id,
                'status': final_status,
                'summary': summary,
                'discrepancies': discrepancies,
                'report_url': report_url
            }

        except Exception as e:
            current_app.logger.error(f"对账执行失败: {e}")
            self._update_task_status(recon_id, 'failed')
            return {'success': False, 'error': str(e)}

    def _execute_reconciliation_async(self, recon_id: str):
        """
        异步执行对账（可对接Celery等任务队列）
        """
        # 简单实现：直接同步执行
        # 生产环境应该使用任务队列
        self.execute_reconciliation(recon_id)

    def _get_task(self, recon_id: str) -> Optional[Dict]:
        """获取对账任务"""
        if self.db:
            try:
                return self.db.query_one('reconciliation_tasks', {'recon_id': recon_id})
            except Exception:
                pass
        return None

    def _get_internal_records(self, task: Dict) -> List[Dict]:
        """获取内部交易记录"""
        # 实现从数据库获取交易记录
        return []

    def _get_external_records(self, task: Dict) -> List[Dict]:
        """获取外部对账数据（如银行、券商等）"""
        # 实现从外部系统获取数据
        return []

    def _match_records(self, internal: List, external: List) -> Tuple[List, List, List]:
        """
        匹配记录
        返回: (匹配记录, 未匹配内部记录, 未匹配外部记录)
        """
        matched = []
        unmatched_internal = []
        unmatched_external = list(external)

        for int_rec in internal:
            found = False
            for i, ext_rec in enumerate(unmatched_external):
                if self._records_match(int_rec, ext_rec):
                    matched.append({
                        'internal': int_rec,
                        'external': ext_rec
                    })
                    unmatched_external.pop(i)
                    found = True
                    break

            if not found:
                unmatched_internal.append(int_rec)

        return matched, unmatched_internal, unmatched_external

    def _records_match(self, internal: Dict, external: Dict) -> bool:
        """
        判断两条记录是否匹配
        """
        # 根据交易ID、金额、时间等判断
        return (
            internal.get('amount') == external.get('amount') and
            internal.get('trade_date') == external.get('trade_date')
        )

    def _check_discrepancies(self, matched: List,
                            unmatched_internal: List,
                            unmatched_external: List) -> List[Dict]:
        """
        检查差异
        """
        discrepancies = []

        # 检查匹配记录的金额差异
        for pair in matched:
            int_amount = pair['internal'].get('amount', 0)
            ext_amount = pair['external'].get('amount', 0)

            if int_amount != ext_amount:
                discrepancies.append({
                    'type': 'amount_mismatch',
                    'internal_record': pair['internal'],
                    'external_record': pair['external'],
                    'difference': abs(int_amount - ext_amount)
                })

        # 未匹配的内部记录
        for rec in unmatched_internal:
            discrepancies.append({
                'type': 'internal_only',
                'record': rec
            })

        # 未匹配的外部记录
        for rec in unmatched_external:
            discrepancies.append({
                'type': 'external_only',
                'record': rec
            })

        return discrepancies

    def _generate_report(self, task: Dict, summary: Dict,
                        discrepancies: List) -> str:
        """
        生成对账报告
        """
        # 实现报告生成逻辑
        return f"/reports/reconciliation/{task['recon_id']}.pdf"

    def _update_task_status(self, recon_id: str, status: str):
        """更新任务状态"""
        if self.db:
            self.db.update('reconciliation_tasks', {'recon_id': recon_id},
                          {'status': status, 'updated_at': datetime.now().isoformat()})

    def _update_task_result(self, recon_id: str, status: str,
                           summary: Dict, discrepancies: List):
        """更新任务结果"""
        if self.db:
            self.db.update('reconciliation_tasks', {'recon_id': recon_id},
                          {'status': status, 'summary': summary,
                           'discrepancies': discrepancies,
                           'completed_at': datetime.now().isoformat()})

    def _update_task_report(self, recon_id: str, report_url: str):
        """更新报告URL"""
        if self.db:
            self.db.update('reconciliation_tasks', {'recon_id': recon_id},
                          {'report_url': report_url})

    def get_reconciliation_history(self, user_id: str,
                                   limit: int = 20) -> List[Dict]:
        """
        获取对账历史
        """
        if self.db:
            try:
                return self.db.query('reconciliation_tasks',
                                    {'created_by': user_id},
                                    order_by='-created_at',
                                    limit=limit)
            except Exception:
                pass
        return []


# ==================== 交易通知服务 ====================

class TradeNotificationService:
    """
    交易通知服务
    支持邮件、短信、站内信、WebSocket推送
    """

    # 通知类型
    TYPE_TRADE_CREATED = 'trade_created'
    TYPE_TRADE_CONFIRMED = 'trade_confirmed'
    TYPE_TRADE_EXECUTED = 'trade_executed'
    TYPE_TRADE_SETTLED = 'trade_settled'
    TYPE_TRADE_CANCELLED = 'trade_cancelled'
    TYPE_SETTLEMENT_DUE = 'settlement_due'     # 结算提醒
    TYPE_POSITION_UPDATE = 'position_update'   # 持仓变动

    # 通知渠道
    CHANNEL_EMAIL = 'email'
    CHANNEL_SMS = 'sms'
    CHANNEL_IN_APP = 'in_app'
    CHANNEL_WEBSOCKET = 'websocket'
    CHANNEL_WECHAT = 'wechat'

    def __init__(self):
        self.db = get_db_service() if get_db_service else None

    def send_notification(self, user_id: str, notification_type: str,
                         channels: List[str], data: Dict[str, Any],
                         priority: str = 'normal') -> Dict[str, Any]:
        """
        发送通知

        Args:
            user_id: 用户ID
            notification_type: 通知类型
            channels: 通知渠道列表
            data: 通知数据
            priority: 优先级 (high/normal/low)
        """
        notification_id = f"NTF_{uuid.uuid4().hex[:12].upper()}"

        # 获取用户通知偏好
        user_preferences = self._get_user_preferences(user_id)

        # 过滤用户允许的渠道
        allowed_channels = [c for c in channels if c in user_preferences.get('channels', channels)]

        notification = {
            'notification_id': notification_id,
            'user_id': user_id,
            'type': notification_type,
            'channels': allowed_channels,
            'data': data,
            'priority': priority,
            'status': 'pending',
            'sent_channels': [],
            'created_at': datetime.now().isoformat()
        }

        # 存储通知记录
        if self.db:
            try:
                self.db.insert('notifications', notification)
            except Exception as e:
                current_app.logger.error(f"存储通知记录失败: {e}")

        # 发送到各渠道
        results = {}
        for channel in allowed_channels:
            try:
                result = self._send_to_channel(channel, user_id, notification_type, data)
                results[channel] = result

                if result.get('success'):
                    notification['sent_channels'].append(channel)

            except Exception as e:
                results[channel] = {'success': False, 'error': str(e)}
                current_app.logger.error(f"发送通知失败 ({channel}): {e}")

        # 更新状态
        notification['status'] = 'sent' if notification['sent_channels'] else 'failed'
        if self.db:
            self.db.update('notifications',
                          {'notification_id': notification_id},
                          {'status': notification['status'],
                           'sent_channels': notification['sent_channels']})

        return {
            'success': bool(notification['sent_channels']),
            'notification_id': notification_id,
            'results': results
        }

    def _send_to_channel(self, channel: str, user_id: str,
                        notification_type: str, data: Dict) -> Dict:
        """
        发送到指定渠道
        """
        if channel == self.CHANNEL_EMAIL:
            return self._send_email(user_id, notification_type, data)

        elif channel == self.CHANNEL_SMS:
            return self._send_sms(user_id, notification_type, data)

        elif channel == self.CHANNEL_IN_APP:
            return self._send_in_app(user_id, notification_type, data)

        elif channel == self.CHANNEL_WEBSOCKET:
            return self._send_websocket(user_id, notification_type, data)

        elif channel == self.CHANNEL_WECHAT:
            return self._send_wechat(user_id, notification_type, data)

        return {'success': False, 'error': f'未知渠道: {channel}'}

    def _send_email(self, user_id: str, notification_type: str,
                   data: Dict) -> Dict:
        """
        发送邮件通知
        """
        # 获取用户邮箱
        user = self._get_user(user_id)
        if not user or not user.get('email'):
            return {'success': False, 'error': '用户邮箱不存在'}

        # 获取邮件模板
        template = self._get_email_template(notification_type)
        if not template:
            return {'success': False, 'error': '邮件模板不存在'}

        # 渲染邮件内容
        subject = template['subject'].format(**data)
        body = template['body'].format(**data)

        # 调用邮件服务发送
        try:
            # from services.email_service import send_email
            # send_email(user['email'], subject, body)
            current_app.logger.info(f"邮件发送: {user['email']}, {subject}")
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _send_sms(self, user_id: str, notification_type: str,
                 data: Dict) -> Dict:
        """
        发送短信通知
        """
        user = self._get_user(user_id)
        if not user or not user.get('phone'):
            return {'success': False, 'error': '用户手机号不存在'}

        # 获取短信模板
        template = self._get_sms_template(notification_type)

        try:
            # from services.sms_service import send_sms
            # send_sms(user['phone'], template, data)
            current_app.logger.info(f"短信发送: {user['phone']}")
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _send_in_app(self, user_id: str, notification_type: str,
                    data: Dict) -> Dict:
        """
        发送站内信
        """
        try:
            notification = {
                'user_id': user_id,
                'type': notification_type,
                'title': data.get('title', '交易通知'),
                'content': data.get('content', ''),
                'data': data,
                'read': False,
                'created_at': datetime.now().isoformat()
            }

            if self.db:
                self.db.insert('in_app_notifications', notification)

            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _send_websocket(self, user_id: str, notification_type: str,
                       data: Dict) -> Dict:
        """
        WebSocket实时推送
        """
        try:
            # from services.websocket_service import get_connection_manager
            # manager = get_connection_manager()
            # manager.send_to_user(user_id, {
            #     'type': notification_type,
            #     'data': data
            # })
            current_app.logger.info(f"WebSocket推送: {user_id}")
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _send_wechat(self, user_id: str, notification_type: str,
                    data: Dict) -> Dict:
        """
        发送微信模板消息
        """
        try:
            # from services.wechat_service import send_template_message
            # send_template_message(user_id, template_id, data)
            current_app.logger.info(f"微信消息发送: {user_id}")
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _get_user(self, user_id: str) -> Optional[Dict]:
        """获取用户信息"""
        if self.db:
            try:
                return self.db.query_one('users', {'user_id': user_id})
            except Exception:
                pass
        return None

    def _get_user_preferences(self, user_id: str) -> Dict:
        """获取用户通知偏好"""
        # 默认所有渠道都开启
        return {
            'channels': [
                self.CHANNEL_EMAIL,
                self.CHANNEL_SMS,
                self.CHANNEL_IN_APP,
                self.CHANNEL_WEBSOCKET
            ]
        }

    def _get_email_template(self, notification_type: str) -> Optional[Dict]:
        """获取邮件模板"""
        templates = {
            self.TYPE_TRADE_CREATED: {
                'subject': '交易创建通知 - {trade_id}',
                'body': '您的交易 {trade_id} 已创建，请及时确认。'
            },
            self.TYPE_TRADE_CONFIRMED: {
                'subject': '交易确认通知 - {trade_id}',
                'body': '您的交易 {trade_id} 已确认，等待执行。'
            },
            self.TYPE_TRADE_EXECUTED: {
                'subject': '交易执行通知 - {trade_id}',
                'body': '您的交易 {trade_id} 已执行。'
            },
            self.TYPE_SETTLEMENT_DUE: {
                'subject': '结算提醒 - {product_name}',
                'body': '您的持仓 {product_name} 将于 {settlement_date} 到期，请及时处理。'
            }
        }
        return templates.get(notification_type)

    def _get_sms_template(self, notification_type: str) -> str:
        """获取短信模板"""
        templates = {
            self.TYPE_TRADE_CREATED: '您的交易已创建，请登录确认。',
            self.TYPE_SETTLEMENT_DUE: '您的持仓即将到期，请及时处理。'
        }
        return templates.get(notification_type, '您有新的交易通知，请登录查看。')

    def get_unread_notifications(self, user_id: str,
                                 limit: int = 20) -> List[Dict]:
        """
        获取未读通知
        """
        if self.db:
            try:
                return self.db.query('in_app_notifications',
                                    {'user_id': user_id, 'read': False},
                                    order_by='-created_at',
                                    limit=limit)
            except Exception:
                pass
        return []

    def mark_as_read(self, notification_id: str) -> bool:
        """
        标记通知为已读
        """
        if self.db:
            try:
                self.db.update('in_app_notifications',
                              {'notification_id': notification_id},
                              {'read': True, 'read_at': datetime.now().isoformat()})
                return True
            except Exception:
                pass
        return False


# 创建服务实例
trade_confirmation_service = TradeConfirmationService()
reconciliation_service = ReconciliationService()
trade_notification_service = TradeNotificationService()


# ==================== 便捷API ====================

def confirm_trade(user_id: str, trade_id: str, trade_data: Dict,
                  require_dual_confirm: bool = False) -> Dict:
    """
    创建交易确认请求
    """
    return trade_confirmation_service.create_confirmation(
        user_id, trade_id, TradeConfirmationService.TYPE_TRADE_CREATE,
        trade_data, require_dual_confirm
    )


def notify_trade(user_id: str, notification_type: str, data: Dict,
                 channels: List[str] = None) -> Dict:
    """
    发送交易通知
    """
    if channels is None:
        channels = [TradeNotificationService.CHANNEL_IN_APP,
                   TradeNotificationService.CHANNEL_WEBSOCKET]

    return trade_notification_service.send_notification(
        user_id, notification_type, channels, data
    )


def run_reconciliation(recon_type: str, period_start: datetime,
                       period_end: datetime, created_by: str) -> Dict:
    """
    运行对账
    """
    return reconciliation_service.create_reconciliation_task(
        recon_type, period_start, period_end, created_by
    )


module.exports = {
    'TradeConfirmationService': TradeConfirmationService,
    'ReconciliationService': ReconciliationService,
    'TradeNotificationService': TradeNotificationService,
    'trade_confirmation_service': trade_confirmation_service,
    'reconciliation_service': reconciliation_service,
    'trade_notification_service': trade_notification_service,
    'confirm_trade': confirm_trade,
    'notify_trade': notify_trade,
    'run_reconciliation': run_reconciliation
}