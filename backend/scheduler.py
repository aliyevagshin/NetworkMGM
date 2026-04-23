from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from database import SessionLocal
import models
from datetime import datetime, timedelta
import asyncio

scheduler = AsyncIOScheduler()

BACKUP_SEM = asyncio.Semaphore(5)   # max 5 concurrent SSH backup sessions
POLL_SEM = asyncio.Semaphore(30)    # max 30 concurrent pings for large device fleets


def _write_log(db, level: str, message: str, source: str = "system", device_id=None):
    try:
        db.add(models.LogEntry(device_id=device_id, level=level, source=source, message=message))
    except Exception:
        pass


def _cleanup_device_backups(db, device_id: int, max_count: int = 3):
    import os
    backups = (
        db.query(models.ConfigBackup)
        .filter(models.ConfigBackup.device_id == device_id)
        .order_by(models.ConfigBackup.created_at.desc())
        .all()
    )
    for b in backups[max_count:]:
        if b.filepath and os.path.exists(b.filepath):
            os.remove(b.filepath)
        db.delete(b)


@scheduler.scheduled_job(CronTrigger(hour=2, minute=0))
async def scheduled_config_backup():
    from services.ssh_service import SSHService
    from services.crypto_service import CryptoService
    import os, re as _re

    db = SessionLocal()
    ssh_service = SSHService()
    crypto = CryptoService()
    backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
    os.makedirs(backup_dir, exist_ok=True)

    max_setting = db.query(models.Setting).filter(models.Setting.key == "max_backup_count").first()
    max_count = int(max_setting.value) if max_setting else 3

    devices = db.query(models.Device).filter(models.Device.status == "online").all()

    async def backup_one(device):
        async with BACKUP_SEM:
            _db = SessionLocal()
            try:
                cred = None
                if device.vault_credential_id:
                    vault = _db.query(models.VaultCredential).filter(
                        models.VaultCredential.id == device.vault_credential_id
                    ).first()
                    if vault:
                        cred = {"username": vault.username, "password": crypto.decrypt(vault.encrypted_password)}

                if not cred:
                    _write_log(_db, "warning", f"Backup skipped for {device.hostname}: no credentials", device_id=device.id)
                    _db.commit()
                    return

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
                    _db.add(models.ConfigBackup(
                        device_id=device.id,
                        filepath=filepath,
                        file_size=len(config.encode()),
                        triggered_by="scheduled",
                    ))
                    dev = _db.query(models.Device).filter(models.Device.id == device.id).first()
                    if dev:
                        dev.last_backup = datetime.utcnow()
                    _cleanup_device_backups(_db, device.id, max_count)
                    _write_log(_db, "info", f"Scheduled backup completed for {device.hostname} ({len(config)} bytes)", device_id=device.id)
                else:
                    _db.add(models.Alert(
                        device_id=device.id,
                        severity="warning",
                        event_type="backup_failed",
                        message=f"Scheduled backup failed for {device.hostname}",
                    ))
                    _write_log(_db, "error", f"Scheduled backup failed for {device.hostname}", device_id=device.id)
                _db.commit()
            except Exception as e:
                _write_log(_db, "error", f"Backup error for {device.hostname}: {e}", device_id=device.id)
                try:
                    _db.commit()
                except Exception:
                    _db.rollback()
            finally:
                _db.close()

    await asyncio.gather(*[backup_one(d) for d in devices])
    db.close()


@scheduler.scheduled_job("interval", seconds=30)
async def poll_all_devices():
    from services.ping_service import ping
    from services.snmp_service import poll_device_metrics

    db = SessionLocal()
    devices = db.query(models.Device).all()
    now = datetime.utcnow()

    async def poll_one(device):
        async with POLL_SEM:
            _db = SessionLocal()
            try:
                result = await ping(device.ip_address, count=2)
                dev = _db.query(models.Device).filter(models.Device.id == device.id).first()
                if not dev:
                    return

                if result["reachable"]:
                    if dev.status == "offline":
                        _write_log(_db, "info", f"{dev.hostname} ({dev.ip_address}) came back online", source="monitoring", device_id=dev.id)
                    dev.status = "online"
                    dev.last_seen = now
                else:
                    if dev.status == "online":
                        _db.add(models.Alert(
                            device_id=dev.id,
                            severity="critical",
                            event_type="device_down",
                            message=f"{dev.hostname} ({dev.ip_address}) is unreachable",
                        ))
                        _write_log(_db, "critical", f"{dev.hostname} ({dev.ip_address}) went offline", source="monitoring", device_id=dev.id)
                    dev.status = "offline"

                if result.get("rtt_ms"):
                    _db.add(models.MetricSample(device_id=dev.id, metric="rtt_ms", value=result["rtt_ms"], timestamp=now))
                if result.get("packet_loss") is not None:
                    _db.add(models.MetricSample(device_id=dev.id, metric="packet_loss", value=result["packet_loss"], timestamp=now))

                if result["reachable"]:
                    snmp = await poll_device_metrics(dev.ip_address, dev.snmp_community or "", dev.snmp_version or "v2c")
                    for metric, value in snmp.items():
                        if metric == "simulated":
                            continue
                        _db.add(models.MetricSample(device_id=dev.id, metric=metric, value=value, timestamp=now))
                        alert_info = _check_threshold(metric, value)
                        if alert_info:
                            existing = _db.query(models.Alert).filter(
                                models.Alert.device_id == dev.id,
                                models.Alert.event_type == f"{metric}_high",
                                models.Alert.resolved == False,
                            ).first()
                            if not existing:
                                _db.add(models.Alert(
                                    device_id=dev.id,
                                    severity=alert_info["severity"],
                                    event_type=f"{metric}_high",
                                    message=f"{dev.hostname}: {metric} at {value}{alert_info['unit']}",
                                ))
                                _write_log(_db, alert_info["severity"], f"{dev.hostname}: {metric} at {value}{alert_info['unit']} (threshold exceeded)", source="snmp", device_id=dev.id)
                            if alert_info["severity"] == "warning" and dev.status == "online":
                                dev.status = "warning"
                _db.commit()
            except Exception:
                try:
                    _db.rollback()
                except Exception:
                    pass
            finally:
                _db.close()

    await asyncio.gather(*[poll_one(d) for d in devices])
    db.close()

    from services import cache_service
    cache_service.invalidate("monitoring:devices")
    cache_service.invalidate("alerts:count")
    cache_service.invalidate_prefix("alerts:list:")


@scheduler.scheduled_job(CronTrigger(hour=3, minute=0))
async def cleanup_old_audit_logs():
    db = SessionLocal()
    cutoff_7d = datetime.utcnow() - timedelta(days=7)
    cutoff_30d = datetime.utcnow() - timedelta(days=30)

    db.query(models.AuditLog).filter(models.AuditLog.timestamp < cutoff_7d).delete()
    db.query(models.LogEntry).filter(models.LogEntry.timestamp < cutoff_7d).delete()
    # MetricSample rows older than 30 days — prevent unbounded table growth
    deleted = db.query(models.MetricSample).filter(models.MetricSample.timestamp < cutoff_30d).delete()
    _write_log(db, "info", f"Retention cleanup: removed {deleted} metric samples older than 30 days")
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
                _write_log(db, severity, f"License '{lic.name}' expires in {days} days", source="system")
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
