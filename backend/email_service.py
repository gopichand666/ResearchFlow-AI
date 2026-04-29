import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

EMAIL_HOST = os.getenv("EMAIL_HOST")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "465"))
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
SENDER_EMAIL = os.getenv("SENDER_EMAIL")


def send_otp_email(recipient_email: str, otp: str):
    if not all([EMAIL_HOST, EMAIL_USER, EMAIL_PASS, SENDER_EMAIL]):
        raise ValueError("Missing email configuration in .env file.")

    msg = EmailMessage()
    msg['Subject'] = "Your Research Aggregator Login Code"
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient_email

    # HTML Email content
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #111827; text-align: center; margin-bottom: 24px;">Memento System Sign-In</h2>
            <p style="color: #4b5563; font-size: 16px;">Hello,</p>
            <p style="color: #4b5563; font-size: 16px;">Here is your secure 6-digit code to access your Research Aggregator dashboard. This code will expire in 10 minutes.</p>
            
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5;">{otp}</span>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      </body>
    </html>
    """

    msg.set_content(f"Your OTP code is: {otp}")  # Fallback plain text
    msg.add_alternative(html_content, subtype='html')

    try:
        # Port 465 usually requires SMTP_SSL
        if EMAIL_PORT == 465:
            server = smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT)
        else:
            server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
            server.starttls()

        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        raise Exception(f"Failed to send email: {str(e)}")
