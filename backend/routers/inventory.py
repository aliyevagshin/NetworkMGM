from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user
import models
import schemas
from datetime import datetime, timedelta

router = APIRouter(tags=["inventory"])


@router.get("/inventory", response_model=List[schemas.InventoryOut])
def list_inventory(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.InventoryItem).all()


@router.post("/inventory", response_model=schemas.InventoryOut)
def create_inventory(item: schemas.InventoryCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/inventory/{item_id}", response_model=schemas.InventoryOut)
def update_inventory(item_id: int, item: schemas.InventoryCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in item.model_dump(exclude_unset=True).items():
        setattr(db_item, k, v)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/inventory/{item_id}")
def delete_inventory(item_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}


@router.get("/licenses", response_model=List[schemas.LicenseOut])
def list_licenses(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.License).all()


@router.post("/licenses", response_model=schemas.LicenseOut)
def create_license(lic: schemas.LicenseCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_lic = models.License(**lic.model_dump())
    db.add(db_lic)
    db.commit()
    db.refresh(db_lic)
    return db_lic


@router.get("/licenses/expiring")
def expiring_licenses(days: int = Query(90), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    cutoff = datetime.utcnow() + timedelta(days=days)
    return db.query(models.License).filter(models.License.expiry_date <= cutoff).all()
