from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, WebSocket
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models
import os

SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-secret-key-64-chars-long-please-change")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 240   # 4 hours
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    to_encode["type"] = "access"
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode["type"] = "refresh"
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def get_current_user_ws(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return None
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user or not user.is_active:
            await websocket.close(code=1008)
            return None
        return user
    except JWTError:
        await websocket.close(code=1008)
        return None


def verify_token(token: str) -> str:
    """Validate a raw JWT string and return the username. Raises JWTError on failure."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    username: str = payload.get("sub")
    if not username:
        raise JWTError("No subject in token")
    return username


def require_role(*roles):
    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker


def log_audit(db: Session, user: str, action: str, target: str, details: str = "", ip: str = ""):
    entry = models.AuditLog(
        user=user, action=action, target=target, details=details, ip_address=ip
    )
    db.add(entry)
    db.commit()
