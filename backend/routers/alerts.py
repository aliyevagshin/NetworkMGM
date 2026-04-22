from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user
import models
import schemas
from services import cache_service

router = APIRouter(prefix="/alerts", tags=["alerts"])

_CACHE_COUNT = "alerts:count"
_CACHE_LIST = "alerts:list:"


@router.get("", response_model=List[schemas.AlertOut])
def list_alerts(
    resolved: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    key = f"{_CACHE_LIST}{resolved}"
    cached = cache_service.get(key)
    if cached is not None:
        return cached
    result = db.query(models.Alert).filter(models.Alert.resolved == resolved).order_by(models.Alert.created_at.desc()).all()
    data = [schemas.AlertOut.model_validate(r).model_dump() for r in result]
    cache_service.set(key, data, ttl=15)
    return result


@router.put("/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        return {"error": "Alert not found"}
    alert.resolved = True
    db.commit()
    cache_service.invalidate_prefix("alerts:")
    return {"ok": True}


@router.get("/count", response_model=schemas.AlertCount)
def alert_count(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    cached = cache_service.get(_CACHE_COUNT)
    if cached is not None:
        return cached
    critical = db.query(models.Alert).filter(models.Alert.severity == "critical", models.Alert.resolved == False).count()
    warning = db.query(models.Alert).filter(models.Alert.severity == "warning", models.Alert.resolved == False).count()
    result = {"critical": critical, "warning": warning}
    cache_service.set(_CACHE_COUNT, result, ttl=10)
    return result
