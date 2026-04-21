from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import require_role, log_audit
import models
import schemas
from services.crypto_service import CryptoService

router = APIRouter(prefix="/ldap", tags=["ldap"])
crypto = CryptoService()


@router.get("", response_model=schemas.LDAPConfigOut)
def get_ldap(db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    cfg = db.query(models.LDAPConfig).first()
    if not cfg:
        cfg = models.LDAPConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.put("", response_model=schemas.LDAPConfigOut)
def update_ldap(
    body: schemas.LDAPConfigCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    cfg = db.query(models.LDAPConfig).first()
    if not cfg:
        cfg = models.LDAPConfig()
        db.add(cfg)

    cfg.server = body.server
    cfg.port = body.port
    cfg.use_ssl = body.use_ssl
    cfg.base_dn = body.base_dn
    cfg.bind_dn = body.bind_dn
    cfg.user_search_filter = body.user_search_filter
    cfg.default_role = body.default_role
    cfg.enabled = body.enabled
    if body.bind_password:
        cfg.encrypted_bind_password = crypto.encrypt(body.bind_password)

    db.commit()
    db.refresh(cfg)
    log_audit(db, current_user.username, "LDAP_UPDATE", body.server or "")
    return cfg


@router.post("/test")
def test_ldap(
    username: str,
    password: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    cfg = db.query(models.LDAPConfig).first()
    if not cfg or not cfg.enabled:
        return {"success": False, "error": "LDAP not configured or disabled"}
    try:
        import ldap3
        server = ldap3.Server(cfg.server, port=cfg.port, use_ssl=cfg.use_ssl)
        search_filter = cfg.user_search_filter.replace("{username}", username)
        bind_pw = crypto.decrypt(cfg.encrypted_bind_password) if cfg.encrypted_bind_password else ""
        conn = ldap3.Connection(server, user=cfg.bind_dn, password=bind_pw, auto_bind=True)
        conn.search(cfg.base_dn, search_filter, attributes=["cn", "mail"])
        if not conn.entries:
            return {"success": False, "error": "User not found in LDAP"}
        user_dn = conn.entries[0].entry_dn
        conn2 = ldap3.Connection(server, user=user_dn, password=password, auto_bind=True)
        return {"success": True, "dn": user_dn}
    except Exception as e:
        return {"success": False, "error": str(e)}
