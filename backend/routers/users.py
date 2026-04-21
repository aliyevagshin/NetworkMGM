from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user, require_role, hash_password, log_audit
import models
import schemas

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return db.query(models.User).all()


@router.post("", response_model=schemas.UserOut)
def create_user(
    body: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    hashed = hash_password(body.password) if body.password else "nopassword"
    user = models.User(username=body.username, hashed_password=hashed, role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(db, current_user.username, "USER_CREATE", body.username, f"role={body.role}")
    return user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    body: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = hash_password(body.password) if body.password else "nopassword"
    db.commit()
    db.refresh(user)
    log_audit(db, current_user.username, "USER_UPDATE", user.username)
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    log_audit(db, current_user.username, "USER_DELETE", user.username)
    db.delete(user)
    db.commit()
    return {"ok": True}
