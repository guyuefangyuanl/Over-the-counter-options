import random
import string
import base64
import logging
from io import BytesIO

logger = logging.getLogger(__name__)

class CaptchaService:
    @staticmethod
    def generate_sms_code(length=6):
        return ''.join(random.choices(string.digits, k=length))

    @staticmethod
    def generate_image_captcha():
        """
        Generates a simple image captcha.
        Returns: (text, base64_image_string)
        """
        try:
            # Try to use captcha library if available
            from captcha.image import ImageCaptcha
            image = ImageCaptcha(width=280, height=90)
            captcha_text = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
            data = image.generate(captcha_text)
            image_b64 = base64.b64encode(data.read()).decode('utf-8')
            return captcha_text, f"data:image/png;base64,{image_b64}"
        except ImportError:
            # Fallback to simple mock if library not installed
            # In production, we should ensure requirements.txt includes `captcha`
            logger.warning("captcha library not found, using mock text-only captcha")
            captcha_text = "ABCD" 
            # 1x1 pixel transparent gif as placeholder
            mock_img = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            return captcha_text, mock_img

    @staticmethod
    def send_sms(phone, code):
        """
        Mock sending SMS. In production, integrate with Twilio/Aliyun.
        """
        logger.info(f"MOCK SMS to {phone}: {code}")
        return True

    @staticmethod
    def send_email(email, code):
        """
        Mock sending Email. In production, integrate with SMTP/SendGrid.
        """
        logger.info(f"MOCK EMAIL to {email}: {code}")
        return True
