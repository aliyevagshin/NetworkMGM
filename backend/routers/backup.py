from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user, log_audit
import models
import schemas
import os

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("", response_model=List[schemas.BackupOut])
def list_backups(
    device_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.ConfigBackup)
    if device_id:
        q = q.filter(models.ConfigBackup.device_id == device_id)
    return q.order_by(models.ConfigBackup.created_at.desc()).all()


@router.get("/{backup_id}/view")
def view_backup(backup_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    backup = db.query(models.ConfigBackup).filter(models.ConfigBackup.id == backup_id).first()
    if not backup or not os.path.exists(backup.filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")
    with open(backup.filepath, "r", errors="replace") as f:
        content = f.read()
    return {
        "id": backup.id,
        "device_id": backup.device_id,
        "filename": os.path.basename(backup.filepath),
        "content": content,
        "file_size": backup.file_size,
        "created_at": backup.created_at,
    }


@router.get("/{backup_id}/download")
def download_backup(backup_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    backup = db.query(models.ConfigBackup).filter(models.ConfigBackup.id == backup_id).first()
    if not backup or not os.path.exists(backup.filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")
    log_audit(db, current_user.username, "BACKUP_DOWNLOAD", backup.filepath)
    return FileResponse(backup.filepath, filename=os.path.basename(backup.filepath))


@router.delete("/{backup_id}")
def delete_backup(backup_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    backup = db.query(models.ConfigBackup).filter(models.ConfigBackup.id == backup_id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    if os.path.exists(backup.filepath):
        os.remove(backup.filepath)
    log_audit(db, current_user.username, "BACKUP_DELETE", backup.filepath)
    db.delete(backup)
    db.commit()
    return {"ok": True}


@router.post("/{device_id}/restore")
def restore_backup(
    device_id: int,
    backup_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from services.ssh_service import SSHService
    from services.crypto_service import CryptoService

    backup = db.query(models.ConfigBackup).filter(models.ConfigBackup.id == backup_id).first()
    if not backup or not os.path.exists(backup.filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cred = None
    if device.vault_credential_id:
        vault = db.query(models.VaultCredential).filter(models.VaultCredential.id == device.vault_credential_id).first()
        if vault:
            crypto = CryptoService()
            cred = {"username": vault.username, "password": crypto.decrypt(vault.encrypted_password)}

    if not cred:
        return {"success": False, "error": "No credentials"}

    with open(backup.filepath, "r") as f:
        config_content = f.read()

    ssh = SSHService()
    try:
        client = ssh.connect(device.ip_address, device.ssh_port, cred["username"], cred["password"])
        # Send config line by line
        channel = client.invoke_shell()
        import time
        time.sleep(1)
        for line in config_content.split("\n"):
            channel.send(line + "\n")
            time.sleep(0.05)
        client.close()
        log_audit(db, current_user.username, "CONFIG_RESTORE", device.hostname, f"Backup ID {backup_id}")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
