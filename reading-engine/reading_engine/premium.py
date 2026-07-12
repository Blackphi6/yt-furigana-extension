"""Premium license, dict sync, and shared dictionary storage."""

from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "premium"
LICENSES_FILE = DATA_DIR / "licenses.json"
SYNC_DIR = DATA_DIR / "sync"
SHARED_FILE = DATA_DIR / "shared-dict.json"

LICENSE_RE = re.compile(r"^ytfp_[a-z0-9][a-z0-9_\-]{10,}$", re.I)

DEFAULT_SHARED = {
    "何故": "なぜ",
    "何故か": "なぜか",
    "何故に": "なぜに",
    "直書き": "じかがき",
    "夏日": "なつび",
    "見惚れる": "みとれる",
}


def _utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SYNC_DIR.mkdir(parents=True, exist_ok=True)
    if not LICENSES_FILE.exists():
        # Demo key for local freemium testing
        demo = {
            "ytfp_live_demo_key_001": {
                "plan": "premium",
                "expiresAt": None,
                "note": "local demo license",
            }
        }
        LICENSES_FILE.write_text(json.dumps(demo, ensure_ascii=False, indent=2), encoding="utf-8")
    if not SHARED_FILE.exists():
        SHARED_FILE.write_text(
            json.dumps({"entries": DEFAULT_SHARED, "revisedAt": _utcnow()}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def load_licenses() -> dict[str, Any]:
    ensure_store()
    env_keys = os.environ.get("YT_FURIGANA_LICENSE_KEYS", "").strip()
    data: dict[str, Any] = {}
    if LICENSES_FILE.exists():
        data = json.loads(LICENSES_FILE.read_text(encoding="utf-8"))
    if env_keys:
        for key in env_keys.split(","):
            key = key.strip()
            if key:
                data[key] = {"plan": "premium", "expiresAt": None, "note": "env"}
    return data


def api_keys() -> set[str]:
    """Optional API keys for /v1/readings. Empty = open (localhost friendly)."""
    raw = os.environ.get("YT_FURIGANA_API_KEYS", "").strip()
    if not raw:
        return set()
    return {k.strip() for k in raw.split(",") if k.strip()}


def require_auth_for_readings() -> bool:
    return bool(api_keys())


def extract_bearer(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


def verify_license_key(license_key: str) -> dict[str, Any]:
    key = (license_key or "").strip()
    if not LICENSE_RE.match(key):
        return {"ok": False, "error": "invalid_shape"}

    licenses = load_licenses()
    record = licenses.get(key)
    if not record:
        return {"ok": False, "error": "unknown_key"}

    expires = record.get("expiresAt")
    if expires:
        try:
            exp_ms = datetime.fromisoformat(expires.replace("Z", "+00:00")).timestamp()
            if exp_ms < datetime.now(timezone.utc).timestamp():
                return {"ok": False, "error": "expired", "expiresAt": expires}
        except ValueError:
            pass

    return {
        "ok": True,
        "plan": record.get("plan") or "premium",
        "expiresAt": expires,
        "licenseKey": key,
    }


def authorize(authorization: str | None, *, premium_only: bool = False) -> dict[str, Any]:
    token = extract_bearer(authorization)
    if not token:
        if premium_only:
            return {"ok": False, "error": "missing_token"}
        if require_auth_for_readings():
            return {"ok": False, "error": "missing_token"}
        return {"ok": True, "plan": "free", "licenseKey": ""}

    # API keys count as premium auth for hosted endpoints
    if token in api_keys():
        return {"ok": True, "plan": "premium", "licenseKey": token, "via": "api_key"}

    result = verify_license_key(token)
    if not result.get("ok"):
        return result
    return result


def _sync_path(license_key: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", license_key)[:80]
    return SYNC_DIR / f"{safe}.json"


def get_sync_dict(license_key: str) -> dict[str, Any]:
    ensure_store()
    path = _sync_path(license_key)
    if not path.exists():
        return {"dict": {}, "revisedAt": None}
    return json.loads(path.read_text(encoding="utf-8"))


def put_sync_dict(license_key: str, dict_body: dict[str, str], revised_at: str | None) -> dict[str, Any]:
    ensure_store()
    cleaned = {
        str(k): str(v)
        for k, v in (dict_body or {}).items()
        if k and v
    }
    payload = {
        "dict": cleaned,
        "revisedAt": revised_at or _utcnow(),
        "updatedAt": _utcnow(),
    }
    _sync_path(license_key).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def get_shared_dict() -> dict[str, Any]:
    ensure_store()
    return json.loads(SHARED_FILE.read_text(encoding="utf-8"))


def mint_license(note: str = "") -> dict[str, Any]:
    """Admin helper: create a new premium license key."""
    ensure_store()
    key = f"ytfp_live_{secrets.token_hex(8)}"
    licenses = load_licenses()
    licenses[key] = {"plan": "premium", "expiresAt": None, "note": note or "minted"}
    LICENSES_FILE.write_text(json.dumps(licenses, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"licenseKey": key, **licenses[key]}
