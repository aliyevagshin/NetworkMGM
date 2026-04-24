from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

import models
from database import SessionLocal
from auth import get_current_user
from tasks import task_bulk_config_device

router = APIRouter(prefix="/bulk-config", tags=["bulk-config"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class BulkConfigJobCreate(BaseModel):
    device_ids: List[int]
    commands: str
    label: Optional[str] = None


class BulkConfigResultOut(BaseModel):
    id: int
    device_id: Optional[int]
    device_hostname: str
    device_ip: str
    status: str
    output: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BulkConfigJobOut(BaseModel):
    id: int
    label: Optional[str] = None
    commands: str
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    results: List[BulkConfigResultOut] = []

    class Config:
        from_attributes = True


@router.post("/jobs", response_model=BulkConfigJobOut)
def create_job(
    payload: BulkConfigJobCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not payload.commands.strip():
        raise HTTPException(400, "Commands cannot be empty")
    if not payload.device_ids:
        raise HTTPException(400, "Select at least one device")

    devices = db.query(models.Device).filter(models.Device.id.in_(payload.device_ids)).all()
    if not devices:
        raise HTTPException(404, "No devices found")

    job = models.BulkConfigJob(
        label=payload.label or None,
        commands=payload.commands.strip(),
        status="running",
        created_by=current_user.username,
    )
    db.add(job)
    db.flush()

    for device in devices:
        db.add(models.BulkConfigResult(
            job_id=job.id,
            device_id=device.id,
            device_hostname=device.hostname,
            device_ip=device.ip_address,
            status="pending",
        ))

    db.commit()
    db.refresh(job)

    for result in job.results:
        task_bulk_config_device.delay(result.id)

    return job


@router.get("/jobs", response_model=List[BulkConfigJobOut])
def list_jobs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(models.BulkConfigJob)
        .order_by(models.BulkConfigJob.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/jobs/{job_id}", response_model=BulkConfigJobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    job = db.query(models.BulkConfigJob).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    job = db.query(models.BulkConfigJob).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()
    return {"ok": True}
