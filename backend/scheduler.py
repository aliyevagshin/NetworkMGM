from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from database import SessionLocal
import models
from datetime import datetime, timedelta
import asyncio

scheduler = AsyncIOScheduler()


@scheduler.scheduled_job(CronTrigger(hour=2, minute=0))
async def scheduled_config_backup():
    from services.ssh_service import SSHService
    from services.crypto_service import CryptoService
    import os

    db = SessionLocal()
    ssh_service = SSHService()
    crypto = CryptoService()
    backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
    os.makedirs(backup_dir, exist_ok=True)

    devices = db.query(models.Device).filter(models.Device.status == "online").all()
    for device in devices:
        cred = None
        if device.vault_credential_id:
            vault = db.query(models.VaultCredential).filter(
                models.VaultCredential.id == device.vault_credential_id
            ).first()
            if vault:
                cred = {"username": vault.username, "password": crypto.decrypt(vault.encrypted_password)}

        if not cred:
            continue

        import re as _re
        config, _ = ssh_service.get_config(
            device.ip_address, device.ssh_port, cred["username"], cred["password"], device.vendor or "cisco"
        )
        if config:
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            safe_name = _re.sub(r"[^\w\-]", "_", device.hostname)
            filename = f"{safe_name}_{device.id}_{timestamp}.cfg"
            filepath = os.path.join(backup_dir, filename)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, "w") as f:
                f.write(config)
            backup = models.ConfigBackup(
                device_id=device.id,
                filepath=filepath,
                file_size=len(config.encode()),
                triggered_by="scheduled",
            )
            db.add(backup)
            device.last_backup = datetime.utcnow()
        else:
            alert = models.Alert(
                device_id=device.id,
                severity="warning",
                event_type="backup_failed",
                message=f"Scheduled backup failed for {device.hostname}",
            )
            db.add(alert)

    # Auto-cleanup: keep only max_backup_count per device
    max_setting = db.query(models.Setting).filter(models.Setting.key == "max_backup_count").first()
    max_count = int(max_setting.value) if max_setting else 30
    devices_with_backups = db.query(models.ConfigBackup.device_id).distinct().all()
    for (device_id,) in devices_with_backups:
        all_backups = (
            db.query(models.ConfigBackup)
            .filter(models.ConfigBackup.device_id == device_id)
            .order_by(models.ConfigBackup.created_at.desc())
            .all()
        )
        to_delete = all_backups[max_count:]
        for b in to_delete:
            if b.filepath and os.path.exists(b.filepath):
                os.remove(b.filepath)
            db.delete(b)
    db.commit()
    db.close()


@scheduler.scheduled_job("interval", seconds=30)
async def poll_all_devices():
    from services.ping_service import ping
    from services.snmp_service import poll_device_metrics

    db = SessionLocal()
    devices = db.query(models.Device).all()
    now = datetime.utcnow()

    for device in devices:
        try:
            result = await ping(device.ip_address, count=2)
            if result["reachable"]:
                device.status = "online"
                device.last_seen = now
            else:
                if device.status == "online":
                    alert = models.Alert(
                        device_id=device.id,
                        severity="critical",
                        event_type="device_down",
                        message=f"{device.hostname} ({device.ip_address}) is unreachable",
                    )
                    db.add(alert)
                device.status = "offline"

            if result.get("rtt_ms"):
                db.add(models.MetricSample(device_id=device.id, metric="rtt_ms", value=result["rtt_ms"], timestamp=now))
            if result.get("packet_loss") is not None:
                db.add(models.MetricSample(device_id=device.id, metric="packet_loss", value=result["packet_loss"], timestamp=now))

            if result["reachable"]:
                snmp = await poll_device_metrics(
                    device.ip_address, device.snmp_community or "", device.snmp_version or "v2c"
                )
                for metric, value in snmp.items():
                    if metric == "simulated":
                        continue
                    db.add(models.MetricSample(device_id=device.id, metric=metric, value=value, timestamp=now))
                    alert_info = _check_threshold(metric, value)
                    if alert_info:
                        existing = db.query(models.Alert).filter(
                            models.Alert.device_id == device.id,
                            models.Alert.event_type == f"{metric}_high",
                            models.Alert.resolved == False,
                        ).first()
                        if not existing:
                            db.add(models.Alert(
                                device_id=device.id,
                                severity=alert_info["severity"],
                                event_type=f"{metric}_high",
                                message=f"{device.hostname}: {metric} at {value}{alert_info['unit']}",
                            ))
                        if alert_info["severity"] == "warning" and device.status == "online":
                            device.status = "warning"
        except Exception:
            pass

    db.commit()
    db.close()
    from services import cache_service
    cache_service.invalidate("monitoring:devices")
    cache_service.invalidate("alerts:count")
    cache_service.invalidate_prefix("alerts:list:")


@scheduler.scheduled_job(CronTrigger(hour=3, minute=0))
async def cleanup_old_audit_logs():
    db = SessionLocal()
    cutoff = datetime.utcnow() - timedelta(days=7)
    db.query(models.AuditLog).filter(models.AuditLog.timestamp < cutoff).delete()
    db.commit()
    db.close()


@scheduler.scheduled_job(CronTrigger(hour=8, minute=0))
async def check_license_expiry():
    db = SessionLocal()
    now = datetime.utcnow()
    thresholds = [90, 30, 7]
    for days in thresholds:
        cutoff = now + timedelta(days=days)
        licenses = db.query(models.License).filter(
            models.License.expiry_date <= cutoff,
            models.License.expiry_date > now,
        ).all()
        for lic in licenses:
            existing = db.query(models.Alert).filter(
                models.Alert.event_type == f"license_expiry_{lic.id}_{days}d",
                models.Alert.resolved == False,
            ).first()
            if not existing:
                severity = "critical" if days <= 7 else ("warning" if days <= 30 else "info")
                db.add(models.Alert(
                    severity=severity,
                    event_type=f"license_expiry_{lic.id}_{days}d",
                    message=f"License '{lic.name}' expires in {days} days ({lic.expiry_date.date()})",
                ))
    db.commit()
    db.close()


def _check_threshold(metric: str, value: float) -> dict | None:
    thresholds = {
        "cpu": {"warn": 70, "critical": 90, "unit": "%"},
        "memory": {"warn": 75, "critical": 90, "unit": "%"},
        "rtt_ms": {"warn": 50, "critical": 150, "unit": "ms"},
        "packet_loss": {"warn": 2, "critical": 5, "unit": "%"},
    }
    t = thresholds.get(metric)
    if not t:
        return None
    if value >= t["critical"]:
        return {"severity": "critical", "unit": t["unit"]}
    if value >= t["warn"]:
        return {"severity": "warning", "unit": t["unit"]}
    return None
