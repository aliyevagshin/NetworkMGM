from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=List[schemas.AlertOut])
def list_alerts(
    resolved: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return db.query(models.Alert).filter(models.Alert.resolved == resolved).order_by(models.Alert.created_at.desc()).all()


@router.put("/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        return {"error": "Alert not found"}
    alert.resolved = True
    db.commit()
    return {"ok": True}


@router.get("/count", response_model=schemas.AlertCount)
def alert_count(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    critical = db.query(models.Alert).filter(models.Alert.severity == "critical", models.Alert.resolved == False).count()
    warning = db.query(models.Alert).filter(models.Alert.severity == "warning", models.Alert.resolved == False).count()
    return {"critical": critical, "warning": warning}
