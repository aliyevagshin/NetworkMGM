from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from services.ssh_service import SSHService
from services.crypto_service import CryptoService
from auth import log_audit
import models
import asyncio
import json
import threading
from datetime import datetime
from jose import JWTError, jwt
import os

router = APIRouter(prefix="/ws", tags=["ssh"])
ssh_service = SSHService()
crypto = CryptoService()

SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-secret-key-64-chars-long-please-change")
ALGORITHM = "HS256"


@router.websocket("/ssh/{device_id}")
async def ssh_websocket(websocket: WebSocket, device_id: int):
    await websocket.accept()
    db = SessionLocal()

    # Authenticate via query token
    token = websocket.query_params.get("token")
    username = "unknown"
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub", "unknown")
    except JWTError:
        await websocket.send_text(json.dumps({"type": "error", "message": "Unauthorized"}))
        await websocket.close(code=1008)
        db.close()
        return

    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        await websocket.send_text(json.dumps({"type": "error", "message": "Device not found"}))
        await websocket.close()
        db.close()
        return

    # Get credentials from vault
    cred = None
    if device.vault_credential_id:
        vault = db.query(models.VaultCredential).filter(models.VaultCredential.id == device.vault_credential_id).first()
        if vault:
            cred = {
                "username": vault.username,
                "password": crypto.decrypt(vault.encrypted_password),
                "key_path": vault.ssh_key_path,
            }

    if not cred:
        await websocket.send_text(json.dumps({"type": "error", "message": "No credentials configured for this device"}))
        await websocket.close()
        db.close()
        return

    # Log session start
    session = models.SSHSession(device_id=device.id, user=username)
    db.add(session)
    db.commit()
    db.refresh(session)
    log_audit(db, username, "SSH_CONNECT", device.hostname, f"Session {session.id}")

    ssh_client = None
    channel = None
    loop = asyncio.get_event_loop()

    try:
        await websocket.send_text(json.dumps({"type": "connected", "host": device.ip_address}))

        def on_data(data: str):
            asyncio.run_coroutine_threadsafe(
                websocket.send_text(json.dumps({"type": "output", "data": data})),
                loop,
            )

        ssh_client, channel = ssh_service.open_interactive_channel(
            host=device.ip_address,
            port=device.ssh_port,
            username=cred["username"],
            password=cred["password"],
            on_data=on_data,
            key_path=cred.get("key_path"),
        )

        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                msg = json.loads(raw)
                if msg.get("type") == "input":
                    channel.send(msg["data"])
                elif msg.get("type") == "resize":
                    channel.resize_pty(width=msg.get("cols", 220), height=msg.get("rows", 50))
            except asyncio.TimeoutError:
                # Keep-alive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
            except WebSocketDisconnect:
                break

    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        if channel:
            channel.close()
        if ssh_client:
            ssh_client.close()
        session.status = "closed"
        session.ended_at = datetime.utcnow()
        db.commit()
        log_audit(db, username, "SSH_DISCONNECT", device.hostname, f"Session {session.id} closed")
        db.close()
