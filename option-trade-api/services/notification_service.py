import logging

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        pass

    def send_notification(self, user_id, title, content, channel='wechat'):
        """
        Send notification stub.
        In production, this would call WeChat API or Email Service.
        """
        logger.info(f"[NOTIFICATION] To: {user_id} | Channel: {channel} | Title: {title} | Content: {content}")
        return True
