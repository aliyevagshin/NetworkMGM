import os
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        import redis
        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        _client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2)
        _client.ping()
        return _client
    except Exception as e:
        logger.warning(f"Redis unavailable — cache disabled: {e}")
        return None


def get(key: str) -> Optional[Any]:
    r = _get_client()
    if not r:
        return None
    try:
        val = r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


def set(key: str, value: Any, ttl: int = 30) -> None:
    r = _get_client()
    if not r:
        return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


def invalidate(key: str) -> None:
    r = _get_client()
    if not r:
        return
    try:
        r.delete(key)
    except Exception:
        pass


def invalidate_prefix(prefix: str) -> None:
    r = _get_client()
    if not r:
        return
    try:
        cursor = 0
        keys = []
        while True:
            cursor, batch = r.scan(cursor, match=f"{prefix}*", count=100)
            keys.extend(batch)
            if cursor == 0:
                break
        if keys:
            r.delete(*keys)
    except Exception:
        pass
