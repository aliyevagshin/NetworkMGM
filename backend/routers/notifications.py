from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import json

router = APIRouter(prefix="/notifications", tags=["notifications"])

EVENT_TYPES = [
    "device_down", "device_up",
    "cpu_high", "memory_high", "packet_loss_high",
    "traffic_threshold",
]


def _ch_dict(c):
    return {
        "id": c.id,
        "name": c.name,
        "channel_type": c.channel_type,
        "config": json.loads(c.config or "{}"),
        "enabled": c.enabled,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _tr_dict(t, db):
    ch = db.query(models.NotificationChannel).filter(
        models.NotificationChannel.id == t.channel_id
    ).first()
    dev = None
    if t.device_id:
        d = db.query(models.Device).filter(models.Device.id == t.device_id).first()
        dev = d.hostname if d else str(t.device_id)
    return {
        "id": t.id,
        "name": t.name,
        "event_type": t.event_type,
        "device_id": t.device_id,
        "device_name": dev,
        "threshold": t.threshold,
        "channel_id": t.channel_id,
        "channel_name": ch.name if ch else None,
        "cooldown_minutes": t.cooldown_minutes,
        "last_fired": t.last_fired.isoformat() if t.last_fired else None,
        "enabled": t.enabled,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ── Channels ──────────────────────────────────────────────────────────────────

@router.get("/channels")
def list_channels(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return [_ch_dict(c) for c in db.query(models.NotificationChannel).all()]


@router.post("/channels")
async def create_channel(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = await request.json()
    ch = models.NotificationChannel(
        name=data["name"],
        channel_type=data["channel_type"],
        config=json.dumps(data.get("config", {})),
        enabled=data.get("enabled", True),
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return _ch_dict(ch)


@router.put("/channels/{channel_id}")
async def update_channel(
    channel_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ch = db.query(models.NotificationChannel).filter(
        models.NotificationChannel.id == channel_id
    ).first()
    if not ch:
        raise HTTPException(404, "Channel not found")
    data = await request.json()
    if "name" in data:
        ch.name = data["name"]
    if "channel_type" in data:
        ch.channel_type = data["channel_type"]
    if "config" in data:
        ch.config = json.dumps(data["config"])
    if "enabled" in data:
        ch.enabled = data["enabled"]
    db.commit()
    db.refresh(ch)
    return _ch_dict(ch)


@router.delete("/channels/{channel_id}")
def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ch = db.query(models.NotificationChannel).filter(
        models.NotificationChannel.id == channel_id
    ).first()
    if not ch:
        raise HTTPException(404, "Channel not found")
    db.delete(ch)
    db.commit()
    return {"ok": True}


@router.post("/channels/{channel_id}/test")
def test_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ch = db.query(models.NotificationChannel).filter(
        models.NotificationChannel.id == channel_id
    ).first()
    if not ch:
        raise HTTPException(404, "Channel not found")
    from services.notification_service import send_to_channel
    ok = send_to_channel(ch, "NMS Test Notification", "This is a test from your NMS system.")
    if not ok:
        raise HTTPException(500, "Failed to send — check channel config and logs")
    return {"ok": True, "message": "Test notification sent"}


# ── Triggers ──────────────────────────────────────────────────────────────────

@router.get("/triggers")
def list_triggers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return [_tr_dict(t, db) for t in db.query(models.AlertTrigger).all()]


@router.post("/triggers")
async def create_trigger(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = await request.json()
    if data.get("event_type") not in EVENT_TYPES:
        raise HTTPException(400, f"event_type must be one of: {EVENT_TYPES}")
    channel = db.query(models.NotificationChannel).filter(
        models.NotificationChannel.id == data.get("channel_id")
    ).first()
    if not channel:
        raise HTTPException(400, "channel_id does not exist")
    t = models.AlertTrigger(
        name=data["name"],
        event_type=data["event_type"],
        device_id=data.get("device_id"),
        threshold=data.get("threshold"),
        channel_id=data["channel_id"],
        cooldown_minutes=data.get("cooldown_minutes", 30),
        enabled=data.get("enabled", True),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tr_dict(t, db)


@router.put("/triggers/{trigger_id}")
async def update_trigger(
    trigger_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    t = db.query(models.AlertTrigger).filter(
        models.AlertTrigger.id == trigger_id
    ).first()
    if not t:
        raise HTTPException(404, "Trigger not found")
    data = await request.json()
    for field in ("name", "event_type", "device_id", "threshold",
                  "channel_id", "cooldown_minutes", "enabled"):
        if field in data:
            setattr(t, field, data[field])
    db.commit()
    return _tr_dict(t, db)


@router.delete("/triggers/{trigger_id}")
def delete_trigger(
    trigger_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    t = db.query(models.AlertTrigger).filter(
        models.AlertTrigger.id == trigger_id
    ).first()
    if not t:
        raise HTTPException(404, "Trigger not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/event-types")
def event_types(current_user=Depends(get_current_user)):
    return EVENT_TYPES
