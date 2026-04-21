from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user
import models
import schemas
from services.ping_service import ping
from services.snmp_service import poll_device_metrics
from datetime import datetime, timedelta
import asyncio

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/devices")
def all_devices_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    devices = db.query(models.Device).all()
    result = []
    for d in devices:
        latest = (
            db.query(models.MetricSample)
            .filter(models.MetricSample.device_id == d.id)
            .order_by(models.MetricSample.timestamp.desc())
            .limit(5)
            .all()
        )
        metrics = {m.metric: m.value for m in latest}
        result.append({
            "id": d.id,
            "hostname": d.hostname,
            "ip_address": d.ip_address,
            "status": d.status,
            "last_seen": d.last_seen,
            "metrics": metrics,
        })
    return result


@router.get("/{device_id}/metrics", response_model=List[schemas.MetricOut])
def device_metrics(
    device_id: int,
    metric: Optional[str] = Query(None),
    hours: int = Query(24),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    query = db.query(models.MetricSample).filter(
        models.MetricSample.device_id == device_id,
        models.MetricSample.timestamp >= since,
    )
    if metric:
        query = query.filter(models.MetricSample.metric == metric)
    return query.order_by(models.MetricSample.timestamp.asc()).all()


@router.post("/poll/{device_id}")
async def manual_poll(device_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        return {"error": "Device not found"}

    ping_result = await ping(device.ip_address)
    now = datetime.utcnow()

    if ping_result["reachable"]:
        device.status = "online"
        device.last_seen = now
    else:
        device.status = "offline"

    samples = []

    if ping_result.get("rtt_ms") is not None:
        samples.append(models.MetricSample(device_id=device.id, metric="rtt_ms", value=ping_result["rtt_ms"], timestamp=now))

    if ping_result.get("packet_loss") is not None:
        samples.append(models.MetricSample(device_id=device.id, metric="packet_loss", value=ping_result["packet_loss"], timestamp=now))

    if device.snmp_community:
        snmp_metrics = await poll_device_metrics(device.ip_address, device.snmp_community, device.snmp_version or "v2c")
        for metric_name, value in snmp_metrics.items():
            samples.append(models.MetricSample(device_id=device.id, metric=metric_name, value=value, timestamp=now))

            # Alert thresholds
            alert = _check_threshold(metric_name, value)
            if alert:
                db_alert = models.Alert(
                    device_id=device.id,
                    severity=alert["severity"],
                    event_type=f"{metric_name}_high",
                    message=f"{device.hostname}: {metric_name} at {value}{alert['unit']}",
                )
                db.add(db_alert)

    for s in samples:
        db.add(s)
    db.commit()

    return {
        "ping": ping_result,
        "metrics": {s.metric: s.value for s in samples},
    }


def _check_threshold(metric: str, value: float) -> dict | None:
    thresholds = {
        "cpu": {"warn": 70, "critical": 90, "unit": "%"},
        "memory": {"warn": 75, "critical": 90, "unit": "%"},
        "rtt_ms": {"warn": 50, "critical": 150, "unit": "ms"},
        "packet_loss": {"warn": 2, "critical": 5, "unit": "%"},
    }
    t = thresholds.get(metric)
    if not t:
        return None
    if value >= t["critical"]:
        return {"severity": "critical", "unit": t["unit"]}
    if value >= t["warn"]:
        return {"severity": "warning", "unit": t["unit"]}
    return None
