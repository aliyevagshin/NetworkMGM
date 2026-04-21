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
from datetime import timedelta
import time
from collections import defaultdict

router = APIRouter(prefix="/auth", tags=["auth"])

# Simple in-memory rate limiter: max 5 login attempts per minute per IP
_login_attempts: dict = defaultdict(list)


def _check_rate_limit(ip: str):
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < 60]
    _login_attempts[ip] = attempts
    if len(attempts) >= 5:
        raise HTTPException(status_code=429, detail="Too many login attempts")
    _login_attempts[ip].append(now)


@router.post("/login", response_model=schemas.Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
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
