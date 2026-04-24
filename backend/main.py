from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import os
from sqlalchemy import text
from prometheus_fastapi_instrumentator import Instrumentator

from database import engine, SessionLocal, DATABASE_URL
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
from routers.users import router as users_router
from routers.topology_links import router as topology_links_router
from routers.logs import router as logs_router
from routers.keypass import router as keypass_router
from routers.ldap import router as ldap_router
from routers.topologies import router as topologies_router
from routers.bulkconfig import router as bulkconfig_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)

    if "postgresql" in DATABASE_URL:
        # CREATE EXTENSION timescaledb drops the current connection on first load
        # (PostgreSQL restarts the backend session when loading a new shared library).
        # Use separate connections and swallow the expected OperationalError.
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
                conn.commit()
        except Exception:
            pass  # connection drop on first timescaledb load is expected

        try:
            with engine.connect() as conn:
                conn.execute(text(
                    "SELECT create_hypertable('metric_samples', 'timestamp', "
                    "if_not_exists => TRUE, migrate_data => TRUE);"
                ))
                conn.commit()
        except Exception:
            pass  # hypertable may already exist

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
            ("max_backup_count", "3", "Max backups kept per device"),
        ]
        for key, value, desc in defaults:
            db.add(models.Setting(key=key, value=value, description=desc))
        db.commit()
    db.close()

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="NMS — Network Management System", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
app.include_router(users_router)
app.include_router(topology_links_router)
app.include_router(logs_router)
app.include_router(keypass_router)
app.include_router(ldap_router)
app.include_router(topologies_router)
app.include_router(bulkconfig_router)


@app.get("/health")
def health():
    return {"status": "ok"}
