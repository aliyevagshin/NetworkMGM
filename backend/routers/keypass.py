from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, require_role, log_audit
import models
import schemas
from services.crypto_service import CryptoService

router = APIRouter(prefix="/keypass", tags=["keypass"])
crypto = CryptoService()


@router.get("", response_model=List[schemas.KeyPassOut])
def list_entries(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.KeyPassEntry).all()


@router.post("", response_model=schemas.KeyPassOut)
def create_entry(
    entry: schemas.KeyPassCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    encrypted = crypto.encrypt(entry.password) if entry.password else None
    db_entry = models.KeyPassEntry(
        name=entry.name,
        username=entry.username,
        encrypted_password=encrypted,
        url=entry.url,
        notes=entry.notes,
        tags=entry.tags,
        category=entry.category,
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    log_audit(db, current_user.username, "KEYPASS_CREATE", entry.name)
    return db_entry


@router.put("/{entry_id}", response_model=schemas.KeyPassOut)
def update_entry(
    entry_id: int,
    entry: schemas.KeyPassCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_entry = db.query(models.KeyPassEntry).filter(models.KeyPassEntry.id == entry_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Not found")
    db_entry.name = entry.name
    db_entry.username = entry.username
    db_entry.url = entry.url
    db_entry.notes = entry.notes
    db_entry.tags = entry.tags
    db_entry.category = entry.category
    if entry.password:
        db_entry.encrypted_password = crypto.encrypt(entry.password)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_entry = db.query(models.KeyPassEntry).filter(models.KeyPassEntry.id == entry_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, current_user.username, "KEYPASS_DELETE", db_entry.name)
    db.delete(db_entry)
    db.commit()
    return {"ok": True}


@router.get("/{entry_id}/password")
def get_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_entry = db.query(models.KeyPassEntry).filter(models.KeyPassEntry.id == entry_id).first()
    if not db_entry or not db_entry.encrypted_password:
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, current_user.username, "KEYPASS_ACCESS", db_entry.name)
    return {"password": crypto.decrypt(db_entry.encrypted_password)}
