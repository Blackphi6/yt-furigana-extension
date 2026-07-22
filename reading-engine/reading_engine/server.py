from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from reading_engine import get_engine
from reading_engine.premium import (
    authorize,
    get_shared_dict,
    get_sync_dict,
    mint_license,
    put_sync_dict,
    require_auth_for_readings,
    verify_license_key,
)
from reading_engine.contributions import (
    append_contribution,
    get_shared_readings_pack,
    merge_curated_entries,
    normalize_entries,
    validate_contribution,
)
from reading_engine.rate_limit import RateLimitMiddleware, client_ip_from_request
from reading_engine.stripe_billing import (
    create_checkout_session,
    get_order,
    handle_stripe_webhook,
    stripe_configured,
)

def is_hosted_production() -> bool:
    if os.environ.get("RENDER", "").lower() == "true":
        return True
    if os.environ.get("YT_FURIGANA_ENV", "").lower() in ("production", "prod"):
        return True
    if os.environ.get("YT_FURIGANA_STRICT", "").strip() in ("1", "true", "yes"):
        return True
    return False


_docs = None if is_hosted_production() else "/docs"
_redoc = None if is_hosted_production() else "/redoc"
app = FastAPI(
    title="YT Furigana Reading Engine",
    version="0.3.0",
    docs_url=_docs,
    redoc_url=_redoc,
)

# Local / Pages demo. Public Space should set YT_FURIGANA_CORS_ORIGINS explicitly.
_cors = os.environ.get(
    "YT_FURIGANA_CORS_ORIGINS",
    "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5500,http://localhost:5500,"
    "https://blackphi6.github.io,null",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)


@app.on_event("startup")
def _bootstrap_shared_readings() -> None:
    """Image seed → curated, rebuild pack so Free clients see phrases after deploy."""
    try:
        from reading_engine.contributions import rebuild_shared_readings

        pack = rebuild_shared_readings()
        print(
            "[shared-readings] bootstrapped",
            f"entries={len(pack.get('entries') or {})}",
            f"curated={pack.get('curatedCount')}",
        )
    except Exception as exc:  # noqa: BLE001
        print("[shared-readings] bootstrap skipped:", exc)


class UserDictEntry(BaseModel):
    surface: str = Field(default="", max_length=64)
    reading: str = Field(default="", max_length=64)


class ReadingRequest(BaseModel):
    text: str = Field(default="", max_length=8000)
    user_dict: list[UserDictEntry] = Field(default_factory=list, max_length=500)
    return_candidates: bool = True


class LicenseVerifyRequest(BaseModel):
    licenseKey: str = Field(default="", max_length=128)


class SyncPutRequest(BaseModel):
    entries: dict[str, str] = Field(default_factory=dict, alias="dict", max_length=5000)
    revisedAt: str | None = Field(default=None, max_length=64)

    model_config = {"populate_by_name": True}


class MintRequest(BaseModel):
    note: str = ""
    adminToken: str = ""


class CheckoutRequest(BaseModel):
    successUrl: str = Field(default="", alias="success_url")
    cancelUrl: str = Field(default="", alias="cancel_url")
    email: str = ""

    model_config = {"populate_by_name": True}


class ContributionRequest(BaseModel):
    surface: str = ""
    reading: str = ""
    contextLeft: str = ""
    contextRight: str = ""


class SharedReadingsSeedRequest(BaseModel):
    adminToken: str = ""
    entries: dict[str, str] = Field(default_factory=dict)
    replace: bool = False


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "yt-furigana-reading-engine",
        "docs": "/docs" if _docs else None,
        "stripeConfigured": stripe_configured(),
        "freemium": {
            "free": [
                "local extension engines",
                "BYO localhost readings",
                "/v1/shared-readings",
                "/v1/contributions (opt-in)",
            ],
            "premium": [
                "/v1/dict/sync",
                "/v1/dict/shared",
                "hosted API keys",
                "Stripe checkout",
            ],
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "readingsAuth": require_auth_for_readings(),
        "stripeConfigured": stripe_configured(),
        # Lets us verify Render redeployed (Blueprint sync alone may skip rebuilds).
        "buildId": os.environ.get("YT_FURIGANA_BUILD_ID") or "local",
        "engineVersion": "0.3.1-clause-cues",
    }


@app.post("/v1/readings")
def readings(
    body: ReadingRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    auth = authorize(authorization, premium_only=False)
    if not auth.get("ok"):
        raise HTTPException(status_code=401, detail=auth.get("error") or "unauthorized")

    engine = get_engine()
    user = [{"surface": e.surface, "reading": e.reading} for e in body.user_dict]
    result = engine.analyze(body.text, user)
    if not body.return_candidates:
        for token in result["tokens"]:
            token.pop("candidates", None)
    return result


@app.post("/v1/license/verify")
def license_verify(body: LicenseVerifyRequest) -> dict[str, Any]:
    result = verify_license_key(body.licenseKey)
    if not result.get("ok"):
        raise HTTPException(status_code=401, detail=result.get("error") or "invalid")
    return {
        "plan": result["plan"],
        "expiresAt": result.get("expiresAt"),
        "licenseKey": result["licenseKey"],
    }


@app.get("/v1/dict/sync")
def dict_sync_get(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    auth = authorize(authorization, premium_only=True)
    if not auth.get("ok"):
        raise HTTPException(status_code=401, detail=auth.get("error") or "unauthorized")
    return get_sync_dict(auth["licenseKey"])


@app.put("/v1/dict/sync")
def dict_sync_put(
    body: SyncPutRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    auth = authorize(authorization, premium_only=True)
    if not auth.get("ok"):
        raise HTTPException(status_code=401, detail=auth.get("error") or "unauthorized")
    return put_sync_dict(auth["licenseKey"], body.entries, body.revisedAt)


@app.get("/v1/dict/shared")
def dict_shared(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    auth = authorize(authorization, premium_only=True)
    if not auth.get("ok"):
        raise HTTPException(status_code=401, detail=auth.get("error") or "unauthorized")
    return get_shared_dict()


@app.post("/v1/contributions")
def contributions_post(
    request: Request, body: ContributionRequest
) -> dict[str, Any]:
    """Anonymous opt-in corrections from the extension (no auth)."""
    try:
        entry = validate_contribution(
            body.surface,
            body.reading,
            body.contextLeft,
            body.contextRight,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return append_contribution(
            entry, client_ip=client_ip_from_request(request)
        )
    except ValueError as exc:
        if str(exc) == "vote_cooldown":
            raise HTTPException(status_code=429, detail="vote_cooldown") from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/shared-readings")
def shared_readings_get() -> dict[str, Any]:
    """Free shared readings pack (curated seed + aggregated contributions)."""
    from fastapi.responses import JSONResponse

    pack = get_shared_readings_pack()
    return JSONResponse(
        content=pack,
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _admin_token_ok(provided: str) -> bool:
    expected = os.environ.get("YT_FURIGANA_ADMIN_TOKEN", "").strip()
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


@app.put("/v1/admin/shared-readings-seed")
def admin_shared_readings_seed(body: SharedReadingsSeedRequest) -> dict[str, Any]:
    """Publish curated (surface→reading) phrases into the Free pack. No captions."""
    if not _admin_token_ok(body.adminToken):
        raise HTTPException(status_code=403, detail="forbidden")
    entries = normalize_entries(body.entries)
    if not entries and not body.replace:
        raise HTTPException(status_code=400, detail="entries_required")
    return merge_curated_entries(entries, replace=body.replace)


@app.post("/v1/admin/mint-license")
def admin_mint(body: MintRequest) -> dict[str, Any]:
    if not _admin_token_ok(body.adminToken):
        raise HTTPException(status_code=403, detail="forbidden")
    return mint_license(body.note)


@app.post("/v1/billing/checkout")
def billing_checkout(body: CheckoutRequest) -> dict[str, Any]:
    try:
        return create_checkout_session(
            success_url=body.successUrl,
            cancel_url=body.cancelUrl,
            customer_email=body.email or None,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/v1/billing/order")
def billing_order(session_id: str = "") -> dict[str, Any]:
    if not session_id or len(session_id) < 12:
        raise HTTPException(status_code=400, detail="session_id required")
    order = get_order(session_id)
    if not order:
        raise HTTPException(status_code=404, detail="not_found")
    # Dry-run licenses are for local testing only; hide key on hosted production.
    license_key = order.get("licenseKey")
    if order.get("mode") == "dry-run" and is_hosted_production():
        license_key = None
    return {
        "sessionId": session_id,
        "licenseKey": license_key,
        "email": order.get("email") or "",
        "createdAt": order.get("createdAt"),
        "mode": order.get("mode"),
    }


@app.post("/v1/billing/webhook")
async def billing_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, Any]:
    payload = await request.body()
    result = handle_stripe_webhook(payload, stripe_signature)
    if not result.get("ok") and str(result.get("error", "")).startswith("invalid_signature"):
        raise HTTPException(status_code=400, detail=result["error"])
    if not result.get("ok") and result.get("error") == "stripe_not_configured":
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    return result
