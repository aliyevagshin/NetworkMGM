from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from auth import (
    verify_password, hash_password, create_access_token,
    create_refresh_token, get_current_user, log_audit,
)
import models
import schemas
from services import cache_service

router = APIRouter(prefix="/auth", tags=["auth"])

_MAX_ATTEMPTS = 5
_WINDOW_SEC   = 60


def _check_rate_limit(ip: str):
    key = f"ratelimit:login:{ip}"
    r = cache_service._get_client()
    if r:
        count = r.incr(key)
        if count == 1:
            r.expire(key, _WINDOW_SEC)
        if count > _MAX_ATTEMPTS:
            ttl = r.ttl(key)
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Try again in {ttl}s.",
            )
    # Redis unavailable — silently allow (fail open, don't block users)


@router.post("/login", response_model=schemas.Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    # Skip password check if stored hash is for empty string or no password set
    no_password = user.hashed_password in ("", None, "nopassword")
    if not no_password and not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    access_token = create_access_token(data={"sub": user.username})
    log_audit(db, user.username, "LOGIN", "auth", "", client_ip)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/refresh", response_model=schemas.Token)
def refresh_token(current_user=Depends(get_current_user)):
    access_token = create_access_token(data={"sub": current_user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user
