"""
Celery task definitions.
Workers are started via:  celery -A tasks worker --loglevel=info --concurrency=8
"""
import os
from celery import Celery
from celery.utils.log import get_task_logger

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "nms",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,                  # re-queue on worker crash
    worker_prefetch_multiplier=1,         # one task at a time per worker thread
    result_expires=3600,                  # task results kept 1h in Redis
    task_default_queue="default",         # match docker-compose worker -Q default
)

logger = get_task_logger(__name__)


# ── SSH test ──────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=1, name="tasks.test_ssh")
def task_test_ssh(self, device_id: int):
    from database import SessionLocal
    from services.ssh_service import SSHService
    from services.crypto_service import CryptoService
    from datetime import datetime
    import models

    db = SessionLocal()
    try:
        device = db.query(models.Device).filter(models.Device.id == device_id).first()
        if not device:
            return {"success": False, "error": "Device not found"}

        cred = _get_credential(db, device, CryptoService())
        if not cred:
            return {"success": False, "error": "No credentials"}

        ssh = SSHService()
        client = ssh.connect(device.ip_address, device.ssh_port, cred["username"], cred["password"])
        client.close()

        device.status = "online"
        device.last_seen = datetime.utcnow()
        db.add(models.LogEntry(device_id=device.id, level="info", source="ssh",
                               message="SSH test succeeded (async)"))
        db.commit()
        return {"success": True}
    except Exception as exc:
        db.rollback()
        db.add(models.LogEntry(device_id=device_id, level="error", source="ssh",
                               message=f"SSH test failed: {exc}"))
        db.commit()
        return {"success": False, "error": str(exc)}
    finally:
        db.close()


# ── Config pull ───────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=1, name="tasks.pull_config", time_limit=120)
def task_pull_config(self, device_id: int, triggered_by: str = "manual"):
    from database import SessionLocal
    from services.ssh_service import SSHService
    from services.crypto_service import CryptoService
    from datetime import datetime
    import models, os, re as _re

    db = SessionLocal()
    backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
    os.makedirs(backup_dir, exist_ok=True)

    try:
        device = db.query(models.Device).filter(models.Device.id == device_id).first()
        if not device:
            return {"success": False, "error": "Device not found"}

        cred = _get_credential(db, device, CryptoService())
        if not cred:
            return {"success": False, "error": "No credentials"}

        ssh = SSHService()
        config, err = ssh.get_config(device.ip_address, device.ssh_port,
                                     cred["username"], cred["password"],
                                     device.vendor or "cisco")
        if not config:
            return {"success": False, "error": err or "Empty config"}

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_name = _re.sub(r"[^\w\-]", "_", device.hostname)
        filename  = f"{safe_name}_{device.id}_{timestamp}.cfg"
        filepath  = os.path.join(backup_dir, filename)
        with open(filepath, "w") as f:
            f.write(config)

        db.add(models.ConfigBackup(
            device_id=device.id, filepath=filepath,
            file_size=len(config.encode()), triggered_by=triggered_by,
        ))
        device.last_backup = datetime.utcnow()
        db.add(models.LogEntry(device_id=device.id, level="info", source="backup",
                               message=f"Config pulled ({len(config)} chars)"))
        db.commit()
        _cleanup_old_backups(db, device_id)
        return {"success": True, "filename": filename, "size": len(config)}
    except Exception as exc:
        db.rollback()
        return {"success": False, "error": str(exc)}
    finally:
        db.close()


# ── IPAM scan ─────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.scan_subnet", time_limit=300)
def task_scan_subnet(self, subnet_id: int, username: str = "system"):
    """Run a full ICMP scan on a subnet asynchronously."""
    import asyncio
    from database import SessionLocal
    from services.ping_service import ping
    import models, ipaddress

    db = SessionLocal()
    try:
        subnet = db.query(models.Subnet).filter(models.Subnet.id == subnet_id).first()
        if not subnet:
            return {"error": "Subnet not found"}

        network = ipaddress.ip_network(subnet.cidr, strict=False)
        hosts   = list(network.hosts())[:254]

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        sem = asyncio.Semaphore(30)

        async def check(ip):
            async with sem:
                return str(ip), await ping(str(ip))

        results = loop.run_until_complete(
            asyncio.gather(*[check(h) for h in hosts])
        )
        loop.close()

        found = 0
        for ip_str, r in results:
            if not r["reachable"]:
                continue
            found += 1
            existing = db.query(models.IPAddress).filter(
                models.IPAddress.address == ip_str
            ).first()
            if not existing:
                db.add(models.IPAddress(
                    address=ip_str, subnet_id=subnet_id,
                    status="allocated", description="Auto-discovered",
                ))

        db.add(models.LogEntry(level="info", source="ipam",
                               message=f"Subnet scan {subnet.cidr}: {found}/{len(hosts)} hosts found"))
        db.commit()
        return {"found": found, "scanned": len(hosts)}
    except Exception as exc:
        db.rollback()
        return {"error": str(exc)}
    finally:
        db.close()


# ── Bulk config push ─────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.bulk_config_device", time_limit=120)
def task_bulk_config_device(self, result_id: int):
    from database import SessionLocal
    from services.crypto_service import CryptoService
    from datetime import datetime
    import models

    db = SessionLocal()
    result = None
    try:
        result = db.query(models.BulkConfigResult).filter_by(id=result_id).first()
        if not result:
            return {"error": "Result not found"}

        result.status = "running"
        result.started_at = datetime.utcnow()
        db.commit()

        device = result.device
        job = result.job
        commands = [c.strip() for c in job.commands.splitlines() if c.strip()]

        cred = _get_credential(db, device, CryptoService())
        if not cred:
            result.status = "error"
            result.error = "No credentials configured for this device"
            result.finished_at = datetime.utcnow()
            db.commit()
            _update_bulk_job_status(db, result.job_id)
            return {"error": "No credentials"}

        from netmiko import ConnectHandler, NetmikoTimeoutException, NetmikoAuthenticationException
        netmiko_type = _vendor_to_netmiko(device.vendor or "", device.os_version or "")
        enable_pass = cred.get("enable_password") or ""

        conn = ConnectHandler(
            device_type=netmiko_type,
            host=device.ip_address,
            port=device.ssh_port or 22,
            username=cred["username"],
            password=cred["password"],
            secret=enable_pass,
            timeout=30,
            session_timeout=60,
            fast_cli=False,
        )
        if enable_pass:
            conn.enable()

        outputs = []
        _CONFIG_ENTER = {"conf t", "configure terminal", "configure"}
        _CONFIG_EXIT  = {"end", "exit", "commit"}

        # Split command list into show-blocks and config-blocks
        i = 0
        while i < len(commands):
            cmd = commands[i]
            if cmd.lower() in _CONFIG_ENTER:
                # Collect all lines until end/exit or end of list
                cfg_cmds = []
                i += 1
                while i < len(commands) and commands[i].lower() not in _CONFIG_EXIT:
                    cfg_cmds.append(commands[i])
                    i += 1
                if i < len(commands) and commands[i].lower() in _CONFIG_EXIT:
                    i += 1  # skip the end/exit line
                if cfg_cmds:
                    try:
                        out = conn.send_config_set(cfg_cmds, read_timeout=30)
                        block = "\n".join(f"(config)# {c}" for c in cfg_cmds)
                        outputs.append(f"{block}\n{out}")
                    except Exception as cfg_err:
                        outputs.append(f"[CONFIG ERROR: {cfg_err}]")
            else:
                try:
                    out = conn.send_command(cmd, read_timeout=30)
                    outputs.append(f"$ {cmd}\n{out}")
                except Exception as cmd_err:
                    outputs.append(f"$ {cmd}\n[ERROR: {cmd_err}]")
                i += 1

        conn.disconnect()

        result.status = "success"
        result.output = "\n\n".join(outputs)
        result.finished_at = datetime.utcnow()
        db.commit()
        _update_bulk_job_status(db, result.job_id)
        return {"success": True}

    except Exception as exc:
        if result:
            result.status = "error"
            result.error = str(exc)
            result.finished_at = datetime.utcnow()
            db.commit()
            _update_bulk_job_status(db, result.job_id)
        return {"error": str(exc)}
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_credential(db, device, crypto):
    if device.vault_credential_id:
        vault = db.query(__import__("models").VaultCredential).filter_by(
            id=device.vault_credential_id
        ).first()
        if vault:
            enable = None
            if vault.encrypted_enable_pass:
                try:
                    enable = crypto.decrypt(vault.encrypted_enable_pass)
                except Exception:
                    pass
            return {
                "username": vault.username,
                "password": crypto.decrypt(vault.encrypted_password),
                "enable_password": enable,
            }
    return None


def _vendor_to_netmiko(vendor: str, os_version: str = "") -> str:
    v = vendor.lower()
    o = os_version.lower()
    if "asa" in v:
        return "cisco_asa"
    if "cisco" in v:
        if "nxos" in o or "nexus" in o:
            return "cisco_nxos"
        if "iosxr" in o or " xr" in o:
            return "cisco_xr"
        if "iosxe" in o or "ios xe" in o:
            return "cisco_xe"
        return "cisco_ios"
    if "juniper" in v or "junos" in v:
        return "juniper_junos"
    if "arista" in v:
        return "arista_eos"
    if "fortinet" in v or "fortigate" in v:
        return "fortinet"
    if "palo" in v:
        return "paloalto_panos"
    if "checkpoint" in v:
        return "checkpoint_gaia"
    if "hp" in v or "hewlett" in v:
        return "hp_procurve" if ("procurve" in o or "provision" in o) else "hp_comware"
    if "mikrotik" in v:
        return "mikrotik_routeros"
    return "linux"


def _update_bulk_job_status(db, job_id: int):
    import models
    job = db.query(models.BulkConfigJob).filter_by(id=job_id).first()
    if job and all(r.status in ("success", "error") for r in job.results):
        job.status = "done"
        db.commit()


def _cleanup_old_backups(db, device_id: int, max_count: int = 3):
    import os, models
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
    db.commit()
