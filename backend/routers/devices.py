from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, log_audit
import models
import schemas
from services.ssh_service import SSHService
from services.crypto_service import CryptoService
from services import cache_service
from datetime import datetime

router = APIRouter(prefix="/devices", tags=["devices"])
ssh_service = SSHService()
crypto = CryptoService()

_CACHE_LIST = "devices:list"


@router.get("", response_model=List[schemas.DeviceOut])
def list_devices(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    cached = cache_service.get(_CACHE_LIST)
    if cached is not None:
        return cached
    devices = db.query(models.Device).all()
    data = [schemas.DeviceOut.model_validate(d).model_dump() for d in devices]
    cache_service.set(_CACHE_LIST, data, ttl=30)
    return devices


@router.post("", response_model=schemas.DeviceOut)
def create_device(
    device: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if db.query(models.Device).filter(models.Device.hostname == device.hostname).first():
        raise HTTPException(status_code=400, detail="Hostname already exists")
    db_device = models.Device(**device.model_dump())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    cache_service.invalidate(_CACHE_LIST)
    log_audit(db, current_user.username, "DEVICE_CREATE", device.hostname)
    return db_device


@router.get("/{device_id}", response_model=schemas.DeviceOut)
def get_device(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}", response_model=schemas.DeviceOut)
def update_device(
    device_id: int,
    updates: schemas.DeviceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    for k, v in updates.model_dump(exclude_unset=True).items():
        setattr(device, k, v)
    db.commit()
    db.refresh(device)
    cache_service.invalidate(_CACHE_LIST)
    log_audit(db, current_user.username, "DEVICE_UPDATE", device.hostname)
    return device


@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    # delete child records first (PostgreSQL enforces FK constraints)
    db.query(models.MetricSample).filter(models.MetricSample.device_id == device_id).delete()
    db.query(models.ConfigBackup).filter(models.ConfigBackup.device_id == device_id).delete()
    db.query(models.Alert).filter(models.Alert.device_id == device_id).delete()
    db.query(models.SSHSession).filter(models.SSHSession.device_id == device_id).delete()
    db.query(models.LogEntry).filter(models.LogEntry.device_id == device_id).delete()
    db.query(models.DeviceLink).filter(
        (models.DeviceLink.source_device_id == device_id) |
        (models.DeviceLink.target_device_id == device_id)
    ).delete(synchronize_session=False)
    log_audit(db, current_user.username, "DEVICE_DELETE", device.hostname)
    db.delete(device)
    db.commit()
    cache_service.invalidate(_CACHE_LIST)
    return {"ok": True}


@router.post("/{device_id}/test-ssh")
def test_ssh(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    cred = _get_credential(db, device)
    if not cred:
        return {"success": False, "error": "No credentials found"}
    try:
        client = ssh_service.connect(
            host=device.ip_address,
            port=device.ssh_port,
            username=cred["username"],
            password=cred["password"],
        )
        client.close()
        device.status = "online"
        device.last_seen = datetime.utcnow()
        db.commit()
        log_audit(db, current_user.username, "SSH_TEST", device.hostname, "Success")
        return {"success": True}
    except Exception as e:
        device.status = "offline"
        db.commit()
        return {"success": False, "error": str(e)}


@router.post("/{device_id}/pull-config")
def pull_config(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    cred = _get_credential(db, device)
    if not cred:
        return {"success": False, "error": "No credentials"}
    import os
    from datetime import datetime as dt

    config, err = ssh_service.get_config(
        host=device.ip_address,
        port=device.ssh_port,
        username=cred["username"],
        password=cred["password"],
        vendor=device.vendor or "cisco",
    )
    if not config:
        return {"success": False, "error": err or "Empty config returned"}

    backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = dt.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{device.hostname}_{timestamp}.cfg"
    filepath = os.path.join(backup_dir, filename)
    with open(filepath, "w") as f:
        f.write(config)

    backup = models.ConfigBackup(
        device_id=device.id,
        filepath=filepath,
        file_size=len(config.encode()),
        triggered_by="manual",
    )
    db.add(backup)
    device.last_backup = dt.utcnow()
    db.commit()
    log_audit(db, current_user.username, "CONFIG_PULL", device.hostname, f"Saved to {filename}")
    return {"success": True, "filepath": filepath}


@router.get("/{device_id}/config-history", response_model=List[schemas.BackupOut])
def config_history(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.ConfigBackup).filter(models.ConfigBackup.device_id == device_id).order_by(models.ConfigBackup.created_at.desc()).all()


@router.post("/{device_id}/detect")
def auto_detect(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """SSH into device and auto-detect serial number + OS version."""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    cred = _get_credential(db, device)
    if not cred:
        return {"success": False, "error": "No credentials"}

    vendor = (device.vendor or "cisco").lower()
    commands = {
        "cisco": "show version",
        "cisco-asa": "show version",
        "mikrotik": "/system resource print\n/system routerboard print",
        "fortinet": "get system status",
        "paloalto": "show system info",
        "checkpoint": "show version",
        "juniper": "show version",
        "hp": "show version",
        "ubiquiti": "show system-info",
    }
    cmd = commands.get(vendor, "show version")

    try:
        client = ssh_service.connect(
            device.ip_address, device.ssh_port, cred["username"], cred["password"]
        )
        stdout, _ = ssh_service.run_command(client, cmd)
        client.close()

        serial, os_ver = _parse_version_output(stdout, vendor)
        if serial:
            device.serial_number = serial if hasattr(device, 'serial_number') else None
            # store in os_version field if no dedicated column
        if os_ver:
            device.os_version = os_ver
        db.commit()
        log_audit(db, current_user.username, "DEVICE_DETECT", device.hostname, f"serial={serial} os={os_ver}")
        return {"success": True, "serial": serial, "os_version": os_ver, "raw": stdout[:500]}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _parse_version_output(output: str, vendor: str) -> tuple:
    import re
    serial = None
    os_ver = None

    if vendor in ("cisco", "cisco-asa"):
        m = re.search(r"Cisco IOS.*?Version\s+([\S]+)", output)
        if m:
            os_ver = "IOS " + m.group(1)
        m = re.search(r"Processor board ID\s+(\S+)", output)
        if m:
            serial = m.group(1)
        # ASA
        m = re.search(r"Cisco Adaptive Security Appliance.*?Version\s+([\S]+)", output)
        if m:
            os_ver = "ASA " + m.group(1)
        m = re.search(r"Serial Number:\s+(\S+)", output)
        if m:
            serial = m.group(1)

    elif vendor == "fortinet":
        m = re.search(r"Version:\s+(.+)", output)
        if m:
            os_ver = m.group(1).strip()
        m = re.search(r"Serial-Number:\s+(\S+)", output)
        if m:
            serial = m.group(1)

    elif vendor == "mikrotik":
        m = re.search(r"version:\s+(.+)", output)
        if m:
            os_ver = "RouterOS " + m.group(1).strip()
        m = re.search(r"serial-number:\s+(\S+)", output)
        if m:
            serial = m.group(1)

    elif vendor == "paloalto":
        m = re.search(r"sw-version:\s+(.+)", output)
        if m:
            os_ver = "PAN-OS " + m.group(1).strip()
        m = re.search(r"serial:\s+(\S+)", output)
        if m:
            serial = m.group(1)

    elif vendor == "checkpoint":
        m = re.search(r"Product version\s+(.+)", output)
        if m:
            os_ver = m.group(1).strip()

    elif vendor == "juniper":
        m = re.search(r"Junos:\s+(\S+)", output)
        if m:
            os_ver = "JunOS " + m.group(1)
        m = re.search(r"Chassis\s+(\S+)", output)
        if m:
            serial = m.group(1)

    return serial, os_ver


def _get_credential(db: Session, device: models.Device) -> dict | None:
    if not device.vault_credential_id:
        return None
    cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == device.vault_credential_id).first()
    if not cred:
        return None
    password = crypto.decrypt(cred.encrypted_password)
    return {"username": cred.username, "password": password}
