from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, require_role
import models
import schemas

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=List[schemas.AuditLogOut])
def get_audit_logs(
    limit: int = Query(100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
