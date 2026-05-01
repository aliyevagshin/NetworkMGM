"""
Notification service — email (SMTP) + Teams / Slack / generic webhooks.
All sends are synchronous (called from APScheduler async jobs via thread).
"""
import json
import smtplib
import urllib.request
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _send_email(config: dict, title: str, body: str):
    to_addrs = config.get("to_addrs", [])
    if isinstance(to_addrs, str):
        to_addrs = [a.strip() for a in to_addrs.split(",") if a.strip()]
    if not to_addrs:
        raise ValueError("No recipient addresses configured")

    from_addr = config.get("from_addr", "nms@localhost")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[NMS Alert] {title}"
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)

    html = (
        f"<html><body>"
        f"<div style='font-family:sans-serif;padding:20px;background:#f0f0f0;'>"
        f"<div style='background:#fff;border-radius:8px;padding:20px;"
        f"border-left:4px solid #ef4444;'>"
        f"<h2 style='margin:0 0 10px;color:#ef4444;'>{title}</h2>"
        f"<p style='color:#333;margin:0;'>{body}</p>"
        f"<hr style='border:none;border-top:1px solid #eee;margin:16px 0;'>"
        f"<p style='color:#999;font-size:12px;margin:0;'>"
        f"NMS &mdash; {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>"
        f"</div></div></body></html>"
    )
    msg.attach(MIMEText(body, "plain"))
    msg.attach(MIMEText(html, "html"))

    host = config.get("smtp_host", "localhost")
    port = int(config.get("smtp_port", 587))
    with smtplib.SMTP(host, port, timeout=15) as s:
        if config.get("smtp_tls", True):
            s.starttls()
        user = config.get("smtp_user", "")
        if user:
            s.login(user, config.get("smtp_pass", ""))
        s.sendmail(from_addr, to_addrs, msg.as_string())


def _send_webhook(channel_type: str, config: dict, title: str, body: str):
    url = config.get("webhook_url") or config.get("url", "")
    if not url:
        raise ValueError("No webhook URL configured")

    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    if channel_type == "teams":
        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "FF0000",
            "title": f"NMS Alert: {title}",
            "text": body,
            "sections": [{"facts": [{"name": "Time", "value": ts}]}],
        }
    elif channel_type == "slack":
        payload = {
            "text": f":rotating_light: *NMS Alert: {title}*\n{body}\n_{ts}_",
        }
    else:
        payload = {"title": title, "message": body, "timestamp": ts, "source": "NMS"}

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "NMS/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status


def send_to_channel(channel, title: str, body: str):
    """Send a notification to a single NotificationChannel ORM object."""
    try:
        config = json.loads(channel.config or "{}")
        if channel.channel_type == "email":
            _send_email(config, title, body)
        else:
            _send_webhook(channel.channel_type, config, title, body)
        return True
    except Exception as e:
        logger.error("Notification failed (channel=%s): %s", channel.name, e)
        return False


def fire_triggers(db, event_type: str, title: str, message: str, device_id: int = None):
    """
    Check AlertTrigger rows matching event_type and send notifications.
    Called synchronously from the APScheduler poll job.
    """
    import models
    now = datetime.utcnow()

    triggers = (
        db.query(models.AlertTrigger)
        .filter(
            models.AlertTrigger.event_type == event_type,
            models.AlertTrigger.enabled == True,
        )
        .all()
    )

    for t in triggers:
        # Device-specific trigger: skip if it targets a different device
        if t.device_id and t.device_id != device_id:
            continue
        # Cooldown guard
        if t.last_fired:
            elapsed = (now - t.last_fired).total_seconds()
            if elapsed < (t.cooldown_minutes or 30) * 60:
                continue

        channel = (
            db.query(models.NotificationChannel)
            .filter(
                models.NotificationChannel.id == t.channel_id,
                models.NotificationChannel.enabled == True,
            )
            .first()
        )
        if not channel:
            continue

        if send_to_channel(channel, title, message):
            t.last_fired = now
            try:
                db.commit()
            except Exception:
                db.rollback()
