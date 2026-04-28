import re
import os
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import SessionLocal
from jose import JWTError, jwt
import models

router = APIRouter(prefix="/proxy", tags=["proxy"])

SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-secret-key-64-chars-long-please-change")
ALGORITHM  = "HS256"

# Headers we must strip from device responses before forwarding to browser
_STRIP_RESP = {
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "strict-transport-security",
    "transfer-encoding",   # httpx decodes chunked/gzip internally
    "content-encoding",
}

# Headers we must not forward to the device
_STRIP_REQ = {"host", "origin", "referer", "content-length"}


def _auth(token: str) -> bool:
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return True
    except JWTError:
        return False


def _proxy_path(device_id: int, protocol: str, port: int, path: str, token: str) -> str:
    return f"/api/proxy/{device_id}?protocol={protocol}&port={port}&path={path}&token={token}"


def _rewrite_html(html: str, device_id: int, protocol: str, port: int,
                  device_base: str, token: str) -> str:
    def make_proxy(path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return _proxy_path(device_id, protocol, port, path, token)

    def replace_attr(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if url.startswith(("javascript:", "data:", "mailto:", "#", "blob:")):
            return m.group(0)
        if url.startswith(("http://", "https://")):
            stripped = device_base.rstrip("/")
            if url.startswith(stripped):
                sub = url[len(stripped):] or "/"
                return f'{attr}={q}{make_proxy(sub)}{q}'
            return m.group(0)
        if url.startswith("//"):
            return m.group(0)
        if url.startswith("/"):
            return f'{attr}={q}{make_proxy(url)}{q}'
        return m.group(0)  # relative — leave as-is

    html = re.sub(r'(href|src|action|data-url)=(["\'])([^"\'> ]+)\2', replace_attr, html)

    # meta refresh rewrite
    html = re.sub(
        r'(content=["\'][0-9]+;\s*url=)(/[^"\']+)(["\'])',
        lambda m: m.group(1) + make_proxy(m.group(2)) + m.group(3),
        html, flags=re.IGNORECASE
    )
    return html


def _rewrite_css(css: str, device_id: int, protocol: str, port: int,
                 device_base: str, token: str) -> str:
    def replace_url(m):
        q, url = m.group(1), m.group(2)
        if url.startswith(("data:", "http://", "https://", "//")):
            return m.group(0)
        if url.startswith("/"):
            return f"url({q}{_proxy_path(device_id, protocol, port, url, token)}{q})"
        return m.group(0)

    return re.sub(r'url\(([\'"]?)(/[^\'")]+)\1\)', replace_url, css)


def _rewrite_set_cookie(raw_value: str, device_id: int) -> str:
    """Scope device cookies to our proxy path so they don't bleed across devices."""
    scope = f"/api/proxy/{device_id}"
    parts = [p.strip() for p in raw_value.split(";")]
    new_parts = [parts[0]]
    path_written = False
    for part in parts[1:]:
        low = part.lower()
        if low.startswith("path="):
            new_parts.append(f"Path={scope}")
            path_written = True
        elif low == "samesite=strict":
            new_parts.append("SameSite=Lax")  # relax so cookie reaches our proxy
        else:
            new_parts.append(part)
    if not path_written:
        new_parts.append(f"Path={scope}")
    return "; ".join(new_parts)


def _error_html(hostname: str, ip: str, port: int, protocol: str, msg: str) -> Response:
    body = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{{font-family:monospace;background:#0a0c12;color:#e8eaf0;
display:flex;align-items:center;justify-content:center;height:100vh;
margin:0;flex-direction:column;gap:10px}}
.e{{color:#ef4444;font-size:14px}}.s{{color:#6b7280;font-size:12px}}</style>
</head><body>
<div class="e">Cannot connect to {hostname}</div>
<div class="s">{protocol}://{ip}:{port} — {msg}</div>
</body></html>"""
    return Response(content=body.encode(), status_code=502, media_type="text/html")


@router.api_route("/{device_id}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_device(device_id: int, request: Request):
    token = request.query_params.get("token", "")
    if not _auth(token):
        return Response("Unauthorized", status_code=401)

    db: Session = SessionLocal()
    try:
        device = db.query(models.Device).filter(models.Device.id == device_id).first()
        if not device:
            return Response("Device not found", status_code=404)
        hostname = device.hostname
        ip       = device.ip_address
    finally:
        db.close()

    protocol = request.query_params.get("protocol", "https")
    port     = int(request.query_params.get("port", "443"))
    path     = request.query_params.get("path", "/")

    # Extra query params that belong to the device URL (not our proxy params)
    extra = {k: v for k, v in request.query_params.items()
             if k not in {"protocol", "port", "path", "token"}}

    device_base = f"{protocol}://{ip}:{port}"
    target_url  = f"{device_base}{path}"

    fwd_headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in _STRIP_REQ}
    fwd_headers["host"] = f"{ip}:{port}"

    body = await request.body() if request.method in ("POST", "PUT", "PATCH") else None

    try:
        async with httpx.AsyncClient(
            verify=False,
            follow_redirects=False,
            timeout=20.0,
        ) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                params=extra if extra else None,
                headers=fwd_headers,
                content=body,
            )
    except httpx.ConnectError:
        return _error_html(hostname, ip, port, protocol, "Connection refused")
    except httpx.ConnectTimeout:
        return _error_html(hostname, ip, port, protocol, "Connection timed out")
    except Exception as e:
        return _error_html(hostname, ip, port, protocol, str(e))

    # ── Redirect: rewrite Location to go through our proxy ──────────────
    if resp.status_code in (301, 302, 303, 307, 308):
        loc = resp.headers.get("location", "/")
        if loc.startswith(("http://", "https://")):
            base_stripped = device_base.rstrip("/")
            if loc.startswith(base_stripped):
                loc = _proxy_path(device_id, protocol, port, loc[len(base_stripped):] or "/", token)
        elif loc.startswith("/"):
            loc = _proxy_path(device_id, protocol, port, loc, token)
        return Response(status_code=resp.status_code, headers={"location": loc})

    # ── Build response headers ───────────────────────────────────────────
    resp_headers: dict[str, str] = {}
    cookies: list[str] = []

    for k, v in resp.headers.multi_items():
        kl = k.lower()
        if kl in _STRIP_RESP:
            continue
        if kl == "set-cookie":
            cookies.append(_rewrite_set_cookie(v, device_id))
        else:
            resp_headers[k] = v

    content_type = resp.headers.get("content-type", "")

    # ── Rewrite body if HTML or CSS ──────────────────────────────────────
    if "text/html" in content_type:
        body_out = _rewrite_html(resp.text, device_id, protocol, port, device_base, token).encode("utf-8")
        media_type = "text/html; charset=utf-8"
    elif "text/css" in content_type:
        body_out = _rewrite_css(resp.text, device_id, protocol, port, device_base, token).encode("utf-8")
        media_type = "text/css; charset=utf-8"
    else:
        body_out   = resp.content
        media_type = content_type or "application/octet-stream"

    response = Response(
        content=body_out,
        status_code=resp.status_code,
        headers=resp_headers,
        media_type=media_type,
    )
    for cv in cookies:
        response.raw_headers.append((b"set-cookie", cv.encode("latin-1")))

    return response
