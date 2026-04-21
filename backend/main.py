from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from database import engine, SessionLocal
import models
from auth import hash_password
from scheduler import scheduler

from routers.auth_router import router as auth_router
from routers.devices import router as devices_router
from routers.ssh import router as ssh_router
from routers.ipam import router as ipam_router
from routers.monitoring import router as monitoring_router
from routers.alerts import router as alerts_router
from routers.inventory import router as inventory_router
from routers.vault import router as vault_router
from routers.files import router as files_router
from routers.backup import router as backup_router
from routers.settings import router as settings_router
from routers.audit import router as audit_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    admin_username = os.environ.get("FIRST_ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("FIRST_ADMIN_PASSWORD", "")

    hashed = hash_password(admin_password) if admin_password else "nopassword"

    existing_admin = db.query(models.User).filter(models.User.username == admin_username).first()
    if existing_admin:
        existing_admin.hashed_password = hashed
        db.commit()
    else:
        admin = models.User(
            username=admin_username,
            hashed_password=hashed,
            role="admin",
        )
        db.add(admin)
        defaults = [
            ("backup_schedule", "02:00", "Daily backup time (HH:MM)"),
            ("poll_interval", "30", "SNMP/ICMP poll interval in seconds"),
            ("alert_email", "", "Alert notification email"),
            ("max_backup_count", "30", "Max backups kept per device"),
        ]
        for key, value, desc in defaults:
            db.add(models.Setting(key=key, value=value, description=desc))
        db.commit()
    db.close()

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="NMS — Network Management System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(ssh_router)
app.include_router(ipam_router)
app.include_router(monitoring_router)
app.include_router(alerts_router)
app.include_router(inventory_router)
app.include_router(vault_router)
app.include_router(files_router)
app.include_router(backup_router)
app.include_router(settings_router)
app.include_router(audit_router)


@app.get("/health")
def health():
    return {"status": "ok"}
