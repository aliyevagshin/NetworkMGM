from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, log_audit
import models
import schemas
from services.ssh_service import SSHService
from services.crypto_service import CryptoService
from datetime import datetime

router = APIRouter(prefix="/devices", tags=["devices"])
ssh_service = SSHService()
crypto = CryptoService()


@router.get("", response_model=List[schemas.DeviceOut])
def list_devices(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.Device).all()


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
    log_audit(db, current_user.username, "DEVICE_UPDATE", device.hostname)
    return device


@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    log_audit(db, current_user.username, "DEVICE_DELETE", device.hostname)
    db.delete(device)
    db.commit()
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

    config = ssh_service.get_config(
        host=device.ip_address,
        port=device.ssh_port,
        username=cred["username"],
        password=cred["password"],
        vendor=device.vendor or "cisco",
    )
    if not config:
        return {"success": False, "error": "Failed to pull config"}

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


def _get_credential(db: Session, device: models.Device) -> dict | None:
    if not device.vault_credential_id:
        return None
    cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == device.vault_credential_id).first()
    if not cred:
        return None
    password = crypto.decrypt(cred.encrypted_password)
    return {"username": cred.username, "password": password}
