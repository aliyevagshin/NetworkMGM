from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=List[schemas.LogEntryOut])
def list_logs(
    device_id: Optional[int] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.LogEntry)
    if device_id:
        q = q.filter(models.LogEntry.device_id == device_id)
    if level:
        q = q.filter(models.LogEntry.level == level)
    return q.order_by(models.LogEntry.timestamp.desc()).limit(limit).all()


@router.post("", response_model=schemas.LogEntryOut)
def create_log(
    entry: schemas.LogEntryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_entry = models.LogEntry(**entry.model_dump())
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.delete("/clear")
def clear_logs(
    device_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.LogEntry)
    if device_id:
        q = q.filter(models.LogEntry.device_id == device_id)
    q.delete()
    db.commit()
    return {"ok": True}
