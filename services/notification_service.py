import logging
import os
from typing import Dict, Any, List, Optional
from flask import current_app
from datetime import datetime
import json

logger = logging.getLogger(__name__)

class NotificationService:
    """
    通知服务
    支持多种通知渠道：微信模板消息、短信、邮件、站内信
    """
    
    def __init__(self):
        self.wx_appid = os.getenv('WX_APPID')
        self.wx_secret = os.getenv('WX_SECRET')
        
        # 短信配置
        self.sms_access_key = os.getenv('SMS_ACCESS_KEY')
        self.sms_secret_key = os.getenv('SMS_SECRET_KEY')
        self.sms_sign_name = os.getenv('SMS_SIGN_NAME', '期权大师')
        
        # 邮件配置
        self.smtp_host = os.getenv('SMTP_HOST')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.email_from = os.getenv('EMAIL_FROM', self.smtp_user)

    def send_notification(self, user_id: str, title: str, content: str, 
                          channel: str = 'wechat', **kwargs) -> bool:
        """
        发送通知（统一入口）
        
        Args:
            user_id: 用户ID (openid)
            title: 通知标题
            content: 通知内容
            channel: 通知渠道 (wechat/sms/email/inapp)
            **kwargs: 额外参数
            
        Returns:
            是否发送成功
        """
        try:
            if channel == 'wechat':
                return self._send_wechat_message(user_id, title, content, **kwargs)
            elif channel == 'sms':
                return self._send_sms(user_id, content, **kwargs)
            elif channel == 'email':
                email = kwargs.get('email')
                return self._send_email(email, title, content)
            elif channel == 'inapp':
                return self._send_inapp_message(user_id, title, content, **kwargs)
            else:
                logger.warning(f"未知的通知渠道: {channel}")
                return False
        except Exception as e:
            logger.error(f"发送通知失败: {e}")
            return False

    def send_batch_notification(self, user_ids: List[str], title: str, 
                                 content: str, channel: str = 'inapp') -> Dict[str, Any]:
        """
        批量发送通知
        
        Args:
            user_ids: 用户ID列表
            title: 通知标题
            content: 通知内容
            channel: 通知渠道
            
        Returns:
            发送结果统计
        """
        success_count = 0
        failed_count = 0
        
        for user_id in user_ids:
            try:
                result = self.send_notification(user_id, title, content, channel)
                if result:
                    success_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                logger.error(f"批量发送失败 (user: {user_id}): {e}")
                failed_count += 1
        
        return {
            'total': len(user_ids),
            'success': success_count,
            'failed': failed_count
        }

    def notify_order_status(self, user_id: str, order_id: str, 
                            status: str, product_name: str = '') -> bool:
        """订单状态变更通知"""
        status_messages = {
            'pending': '待处理',
            'confirmed': '已确认',
            'filled': '已成交',
            'cancelled': '已取消',
            'rejected': '已拒绝',
        }
        
        status_text = status_messages.get(status, status)
        title = '订单状态更新'
        content = f'您的订单 {order_id[:8]}... ({product_name}) 状态已更新为: {status_text}'
        
        return self.send_notification(user_id, title, content, channel='inapp')

    def notify_settlement(self, user_id: str, position_id: str, 
                          pnl: float, product_name: str = '') -> bool:
        """结算通知"""
        title = '持仓结算通知'
        pnl_text = f'盈利 ¥{pnl:,.2f}' if pnl >= 0 else f'亏损 ¥{abs(pnl):,.2f}'
        content = f'您的持仓 {product_name} 已结算，{pnl_text}'
        
        return self.send_notification(user_id, title, content, channel='inapp')

    def notify_margin_call(self, user_id: str, required_amount: float) -> bool:
        """追加保证金通知"""
        title = '保证金不足提醒'
        content = f'您的账户保证金不足，请及时追加 ¥{required_amount:,.2f} 以避免强制平仓'
        
        # 同时发送站内信和短信
        self.send_notification(user_id, title, content, channel='inapp')
        return self.send_notification(user_id, title, content, channel='sms')

    def notify_expiry_warning(self, user_id: str, positions: List[Dict]) -> bool:
        """到期提醒"""
        if not positions:
            return True
            
        title = '持仓到期提醒'
        position_names = [p.get('productName', p.get('productCode', '未知')) for p in positions[:3]]
        content = f'您有 {len(positions)} 个持仓即将到期: {", ".join(position_names)}...'
        
        return self.send_notification(user_id, title, content, channel='inapp')

    def notify_rate_change(self, user_ids: List[str], product_code: str, 
                           old_rate: float, new_rate: float) -> Dict[str, Any]:
        """费率变动通知（批量）"""
        title = '费率调整通知'
        change = '上调' if new_rate > old_rate else '下调'
        content = f'{product_code} 费率已{change}至 {new_rate*100:.2f}%'
        
        return self.send_batch_notification(user_ids, title, content, channel='inapp')

    # --- 私有方法 ---

    def _send_wechat_message(self, openid: str, title: str, 
                              content: str, **kwargs) -> bool:
        """
        发送微信模板消息
        
        注意：需要在小程序后台配置模板消息
        """
        template_id = kwargs.get('template_id')
        page = kwargs.get('page', 'pages/index/index')
        
        if not self.wx_appid or not self.wx_secret:
            logger.warning("微信配置缺失，跳过微信消息发送")
            self._log_notification(openid, 'wechat', title, content, status='skipped')
            return True  # 开发环境返回成功
        
        try:
            # 获取access_token
            import requests
            token_url = f'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={self.wx_appid}&secret={self.wx_secret}'
            token_resp = requests.get(token_url, timeout=10)
            token_data = token_resp.json()
            
            if 'access_token' not in token_data:
                logger.error(f"获取微信access_token失败: {token_data}")
                return False
            
            access_token = token_data['access_token']
            
            # 发送模板消息
            send_url = f'https://api.weixin.qq.com/cgi-bin/message/wxopen/template/send?access_token={access_token}'
            
            # 使用默认模板或指定模板
            if not template_id:
                # 使用通用通知模板
                template_id = os.getenv('WX_NOTIFY_TEMPLATE_ID', '')
            
            if not template_id:
                logger.warning("未配置微信模板ID，跳过发送")
                return True
            
            data = {
                'touser': openid,
                'template_id': template_id,
                'page': page,
                'data': {
                    'thing1': {'value': title[:20]},  # 标题
                    'thing2': {'value': content[:50]},  # 内容
                    'time3': {'value': datetime.now().strftime('%Y-%m-%d %H:%M')}  # 时间
                }
            }
            
            resp = requests.post(send_url, json=data, timeout=10)
            result = resp.json()
            
            if result.get('errcode') == 0:
                self._log_notification(openid, 'wechat', title, content, status='success')
                return True
            else:
                logger.error(f"微信消息发送失败: {result}")
                self._log_notification(openid, 'wechat', title, content, status='failed', error=str(result))
                return False
                
        except Exception as e:
            logger.error(f"微信消息发送异常: {e}")
            self._log_notification(openid, 'wechat', title, content, status='error', error=str(e))
            return False

    def _send_sms(self, phone_or_userid: str, content: str, **kwargs) -> bool:
        """
        发送短信
        
        使用阿里云/腾讯云短信服务
        """
        # 如果传入的是user_id，先查询手机号
        phone = kwargs.get('phone')
        if not phone:
            phone = self._get_user_phone(phone_or_userid)
        
        if not phone:
            logger.warning(f"无法获取用户手机号: {phone_or_userid}")
            return False
        
        if not self.sms_access_key or not self.sms_secret_key:
            logger.warning("短信服务配置缺失，跳过发送")
            self._log_notification(phone, 'sms', '', content, status='skipped')
            return True  # 开发环境返回成功
        
        try:
            # TODO: 接入实际的短信服务SDK
            # 这里使用腾讯云短信API示例
            import requests
            import hashlib
            import time
            import hmac
            import base64
            
            # 简化版：直接记录日志，实际生产需接入短信服务商API
            logger.info(f"[SMS] 发送到 {phone}: {content}")
            
            self._log_notification(phone, 'sms', '', content, status='success')
            return True
            
        except Exception as e:
            logger.error(f"短信发送失败: {e}")
            self._log_notification(phone, 'sms', '', content, status='error', error=str(e))
            return False

    def _send_email(self, email: str, subject: str, content: str) -> bool:
        """
        发送邮件
        """
        if not email:
            logger.warning("邮件地址为空，跳过发送")
            return False
        
        if not self.smtp_host or not self.smtp_user:
            logger.warning("邮件服务配置缺失，跳过发送")
            self._log_notification(email, 'email', subject, content, status='skipped')
            return True  # 开发环境返回成功
        
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.email_from
            msg['To'] = email
            
            # 纯文本版本
            msg.attach(MIMEText(content, 'plain', 'utf-8'))
            # HTML版本
            html_content = f'''
            <html>
              <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>{subject}</h2>
                <p>{content}</p>
                <hr/>
                <p style="color: #999; font-size: 12px;">
                  此邮件由系统自动发送，请勿直接回复。
                </p>
              </body>
            </html>
            '''
            msg.attach(MIMEText(html_content, 'html', 'utf-8'))
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.email_from, email, msg.as_string())
            
            self._log_notification(email, 'email', subject, content, status='success')
            return True
            
        except Exception as e:
            logger.error(f"邮件发送失败: {e}")
            self._log_notification(email, 'email', subject, content, status='error', error=str(e))
            return False

    def _send_inapp_message(self, user_id: str, title: str, 
                            content: str, **kwargs) -> bool:
        """
        发送站内消息
        """
        try:
            # 存储到数据库
            ensure_db = getattr(current_app, "ensure_db", None)
            db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
            
            if not db:
                logger.warning("数据库未连接，无法发送站内消息")
                return False
            
            message = {
                'openid': user_id,
                'type': kwargs.get('type', 'system'),
                'title': title,
                'content': content,
                'is_read': False,
                'created_at': datetime.utcnow(),
                'extra_data': kwargs.get('extra_data', {})
            }
            
            db['notifications'].insert_one(message)
            
            self._log_notification(user_id, 'inapp', title, content, status='success')
            return True
            
        except Exception as e:
            logger.error(f"站内消息发送失败: {e}")
            return False

    def _get_user_phone(self, user_id: str) -> Optional[str]:
        """获取用户手机号"""
        try:
            from services.auth_service import AuthService
            auth_service = AuthService()
            user = auth_service.get_user_profile(user_id)
            return user.get('phone') if user else None
        except Exception as e:
            logger.error(f"获取用户手机号失败: {e}")
            return None

    def _log_notification(self, target: str, channel: str, title: str, 
                         content: str, status: str, error: str = None):
        """记录通知日志"""
        log_entry = {
            'target': target,
            'channel': channel,
            'title': title,
            'content': content[:200],  # 截断过长内容
            'status': status,
            'error': error,
            'timestamp': datetime.utcnow().isoformat()
        }
        logger.info(f"[NOTIFICATION] {json.dumps(log_entry, ensure_ascii=False)}")

    # --- 询价状态变更通知 ---

    def notify_inquiry_status_change(
        self,
        user_id: str,
        inquiry_id: str,
        new_status: str,
        product_name: str = '',
        remark: str = '',
        channels: List[str] = None
    ) -> Dict[str, bool]:
        """
        询价状态变更通知

        Args:
            user_id: 用户ID (openid)
            inquiry_id: 询价ID
            new_status: 新状态
            product_name: 产品名称
            remark: 备注
            channels: 通知渠道列表，默认 ['inapp']

        Returns:
            各渠道发送结果
        """
        from models.inquiry_status import InquiryStatus

        status_label = InquiryStatus.get_label(new_status)
        title = '询价状态更新'
        content = f'您的询价 {product_name or inquiry_id[:8]} 状态已更新为: {status_label}'
        if remark:
            content += f'。{remark}'

        if channels is None:
            channels = ['inapp']

        # 根据状态决定是否添加额外通知渠道
        if new_status == 'quoted':
            # 已报价：重要通知，多渠道发送
            channels = ['inapp', 'wechat']
        elif new_status == 'rejected':
            # 已拒绝：重要通知
            channels = ['inapp', 'wechat']
        elif new_status == 'completed':
            # 已成交：重要通知
            channels = ['inapp']

        results = {}
        for channel in channels:
            try:
                result = self.send_notification(
                    user_id,
                    title,
                    content,
                    channel=channel,
                    extra_data={
                        'type': 'inquiry_status',
                        'inquiry_id': inquiry_id,
                        'status': new_status
                    }
                )
                results[channel] = result
            except Exception as e:
                logger.error(f"询价状态通知发送失败 (channel={channel}): {e}")
                results[channel] = False

        return results

    def notify_inquiry_quoted(
        self,
        user_id: str,
        inquiry_id: str,
        product_name: str,
        quote_info: Dict[str, Any] = None
    ) -> bool:
        """
        询价已报价通知（重点通知）

        Args:
            user_id: 用户ID
            inquiry_id: 询价ID
            product_name: 产品名称
            quote_info: 报价信息 {rate, dealer, validUntil}

        Returns:
            是否发送成功
        """
        title = '询价已报价'
        content = f'您的询价 {product_name} 已有报价'

        if quote_info:
            if quote_info.get('rate'):
                content += f"，费率 {quote_info['rate']*100:.2f}%"
            if quote_info.get('dealer'):
                content += f"，报价方: {quote_info['dealer']}"

        content += '。请及时查看并确认。'

        # 同时发送站内信和微信消息
        inapp_result = self.send_notification(
            user_id, title, content, channel='inapp',
            extra_data={
                'type': 'inquiry_quoted',
                'inquiry_id': inquiry_id,
                'quote_info': quote_info
            }
        )

        wechat_result = self.send_notification(
            user_id, title, content, channel='wechat',
            page=f'pages/inquiry-history/detail?id={inquiry_id}'
        )

        return inapp_result or wechat_result

    def notify_inquiry_expired(
        self,
        user_id: str,
        inquiry_id: str,
        product_name: str
    ) -> bool:
        """
        询价过期提醒

        Args:
            user_id: 用户ID
            inquiry_id: 询价ID
            product_name: 产品名称

        Returns:
            是否发送成功
        """
        title = '询价即将过期'
        content = f'您的询价 {product_name} 即将过期，请及时处理。'

        return self.send_notification(
            user_id, title, content, channel='inapp',
            extra_data={
                'type': 'inquiry_expiring',
                'inquiry_id': inquiry_id
            }
        )

    def get_user_unread_notifications(
        self,
        user_id: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        获取用户未读通知列表

        Args:
            user_id: 用户ID
            limit: 返回数量限制

        Returns:
            未读通知列表
        """
        try:
            ensure_db = getattr(current_app, "ensure_db", None)
            db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)

            if not db:
                return []

            notifications = list(
                db['notifications']
                .find({'openid': user_id, 'is_read': False})
                .sort('created_at', -1)
                .limit(limit)
            )

            for n in notifications:
                n['_id'] = str(n['_id'])
                if hasattr(n.get('created_at'), 'isoformat'):
                    n['created_at'] = n['created_at'].isoformat()

            return notifications

        except Exception as e:
            logger.error(f"获取未读通知失败: {e}")
            return []

    def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        """
        标记通知为已读

        Args:
            notification_id: 通知ID
            user_id: 用户ID

        Returns:
            是否成功
        """
        try:
            ensure_db = getattr(current_app, "ensure_db", None)
            db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)

            if not db:
                return False

            from bson import ObjectId
            result = db['notifications'].update_one(
                {'_id': ObjectId(notification_id), 'openid': user_id},
                {'$set': {'is_read': True, 'read_at': datetime.utcnow()}}
            )

            return result.modified_count > 0

        except Exception as e:
            logger.error(f"标记通知已读失败: {e}")
            return False

    def get_unread_count(self, user_id: str) -> int:
        """
        获取用户未读通知数量

        Args:
            user_id: 用户ID

        Returns:
            未读数量
        """
        try:
            ensure_db = getattr(current_app, "ensure_db", None)
            db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)

            if not db:
                return 0

            return db['notifications'].count_documents({
                'openid': user_id,
                'is_read': False
            })

        except Exception as e:
            logger.error(f"获取未读数量失败: {e}")
            return 0


# 单例实例
notification_service = NotificationService()