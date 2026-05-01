from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/netflow", tags=["netflow"])

_NF_TYPES = ("router", "firewall")


@router.get("/devices")
def get_devices(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return only router and firewall devices."""
    devices = (
        db.query(models.Device)
        .filter(models.Device.device_type.in_(_NF_TYPES))
        .order_by(models.Device.hostname)
        .all()
    )
    return [
        {
            "id": d.id,
            "hostname": d.hostname,
            "ip_address": d.ip_address,
            "device_type": d.device_type,
            "vendor": d.vendor,
            "status": d.status,
        }
        for d in devices
    ]


@router.get("/flows")
def get_flows(
    device_id: Optional[int] = Query(None),
    protocol: Optional[str] = Query(None),
    hours: int = Query(1, ge=1, le=24),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(models.FlowRecord).filter(models.FlowRecord.timestamp >= since)
    if device_id:
        q = q.filter(models.FlowRecord.device_id == device_id)
    if protocol:
        q = q.filter(models.FlowRecord.protocol == protocol)
    rows = q.order_by(models.FlowRecord.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "src_ip": r.src_ip,
            "dst_ip": r.dst_ip,
            "src_port": r.src_port,
            "dst_port": r.dst_port,
            "protocol": r.protocol,
            "bytes": r.bytes,
            "packets": r.packets,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in rows
    ]


@router.get("/summary")
def get_summary(
    device_id: Optional[int] = Query(None),
    hours: int = Query(1, ge=1, le=24),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(models.FlowRecord).filter(models.FlowRecord.timestamp >= since)
    if device_id:
        q = q.filter(models.FlowRecord.device_id == device_id)
    flows = q.all()

    total_bytes = sum(f.bytes for f in flows)
    total_packets = sum(f.packets for f in flows)

    # Protocol breakdown
    proto: dict[str, dict] = {}
    for f in flows:
        p = f.protocol
        if p not in proto:
            proto[p] = {"protocol": p, "count": 0, "bytes": 0}
        proto[p]["count"] += 1
        proto[p]["bytes"] += f.bytes

    # Top 10 source IPs by bytes
    src: dict[str, int] = {}
    for f in flows:
        src[f.src_ip] = src.get(f.src_ip, 0) + f.bytes
    top_talkers = sorted(
        [{"ip": ip, "bytes": b} for ip, b in src.items()],
        key=lambda x: x["bytes"],
        reverse=True,
    )[:10]

    # Top 10 destination IPs by bytes
    dst: dict[str, int] = {}
    for f in flows:
        dst[f.dst_ip] = dst.get(f.dst_ip, 0) + f.bytes
    top_destinations = sorted(
        [{"ip": ip, "bytes": b} for ip, b in dst.items()],
        key=lambda x: x["bytes"],
        reverse=True,
    )[:10]

    return {
        "total_flows": len(flows),
        "total_bytes": total_bytes,
        "total_packets": total_packets,
        "protocol_breakdown": sorted(
            proto.values(), key=lambda x: x["bytes"], reverse=True
        ),
        "top_talkers": top_talkers,
        "top_destinations": top_destinations,
    }
