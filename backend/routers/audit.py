from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user, require_role
import models
import schemas
from datetime import datetime, timedelta

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=List[schemas.AuditLogOut])
def get_audit_logs(
    limit: int = Query(200),
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    target: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("engineer", "admin")),
):
    q = db.query(models.AuditLog)
    if user:
        q = q.filter(models.AuditLog.user.ilike(f"%{user}%"))
    if action:
        q = q.filter(models.AuditLog.action.ilike(f"%{action}%"))
    if target:
        q = q.filter(models.AuditLog.target.ilike(f"%{target}%"))
    return q.order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
