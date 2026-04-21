from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, require_role
import models
import schemas

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=List[schemas.SettingOut])
def get_settings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.Setting).all()


@router.put("")
def update_settings(
    body: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    for key, value in body.settings.items():
        existing = db.query(models.Setting).filter(models.Setting.key == key).first()
        if existing:
            existing.value = str(value)
        else:
            db.add(models.Setting(key=key, value=str(value)))
    db.commit()
    return {"ok": True}
