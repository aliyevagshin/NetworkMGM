from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/topology", tags=["topology"])


@router.get("/links", response_model=List[schemas.DeviceLinkOut])
def list_links(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.DeviceLink).all()


@router.post("/links", response_model=schemas.DeviceLinkOut)
def create_link(
    link: schemas.DeviceLinkCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_link = models.DeviceLink(**link.model_dump())
    db.add(db_link)
    db.commit()
    db.refresh(db_link)
    return db_link


@router.put("/links/{link_id}", response_model=schemas.DeviceLinkOut)
def update_link(
    link_id: int,
    link: schemas.DeviceLinkCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_link = db.query(models.DeviceLink).filter(models.DeviceLink.id == link_id).first()
    if not db_link:
        raise HTTPException(status_code=404, detail="Link not found")
    for k, v in link.model_dump(exclude_unset=True).items():
        setattr(db_link, k, v)
    db.commit()
    db.refresh(db_link)
    return db_link


@router.delete("/links/{link_id}")
def delete_link(link_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_link = db.query(models.DeviceLink).filter(models.DeviceLink.id == link_id).first()
    if not db_link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(db_link)
    db.commit()
    return {"ok": True}
