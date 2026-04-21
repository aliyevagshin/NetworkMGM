from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, log_audit, require_role
import models
import schemas
from services.crypto_service import CryptoService

router = APIRouter(prefix="/vault", tags=["vault"])
crypto = CryptoService()


@router.get("", response_model=List[schemas.VaultCredentialOut])
def list_credentials(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.VaultCredential).all()


@router.post("", response_model=schemas.VaultCredentialOut)
def create_credential(
    cred: schemas.VaultCredentialCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    db_cred = models.VaultCredential(
        name=cred.name,
        username=cred.username,
        encrypted_password=crypto.encrypt(cred.password),
        encrypted_enable_pass=crypto.encrypt(cred.enable_pass) if cred.enable_pass else None,
        ssh_key_path=cred.ssh_key_path,
        tags=cred.tags,
    )
    db.add(db_cred)
    db.commit()
    db.refresh(db_cred)
    log_audit(db, current_user.username, "VAULT_CREATE", cred.name)
    return db_cred


@router.put("/{cred_id}", response_model=schemas.VaultCredentialOut)
def update_credential(
    cred_id: int,
    cred: schemas.VaultCredentialCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    db_cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == cred_id).first()
    if not db_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    db_cred.name = cred.name
    db_cred.username = cred.username
    db_cred.encrypted_password = crypto.encrypt(cred.password)
    if cred.enable_pass:
        db_cred.encrypted_enable_pass = crypto.encrypt(cred.enable_pass)
    db_cred.ssh_key_path = cred.ssh_key_path
    db_cred.tags = cred.tags
    db.commit()
    db.refresh(db_cred)
    log_audit(db, current_user.username, "VAULT_UPDATE", cred.name)
    return db_cred


@router.delete("/{cred_id}")
def delete_credential(
    cred_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, current_user.username, "VAULT_DELETE", cred.name)
    db.delete(cred)
    db.commit()
    return {"ok": True}


@router.get("/{cred_id}/password")
def get_password(
    cred_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, current_user.username, "VAULT_ACCESS", cred.name, "Password revealed")
    return {"password": crypto.decrypt(cred.encrypted_password)}


@router.post("/{cred_id}/copy")
def copy_password(
    cred_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    cred = db.query(models.VaultCredential).filter(models.VaultCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, current_user.username, "VAULT_COPY", cred.name, "One-time copy")
    return {"password": crypto.decrypt(cred.encrypted_password)}
