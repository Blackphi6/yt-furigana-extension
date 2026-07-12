from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
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
from reading_engine.stripe_billing import (
    create_checkout_session,
    get_order,
    handle_stripe_webhook,
    stripe_configured,
)

app = FastAPI(title="YT Furigana Reading Engine", version="0.3.0")


class UserDictEntry(BaseModel):
    surface: str
    reading: str


class ReadingRequest(BaseModel):
    text: str
    user_dict: list[UserDictEntry] = Field(default_factory=list)
    return_candidates: bool = True


class LicenseVerifyRequest(BaseModel):
    licenseKey: str = ""


class SyncPutRequest(BaseModel):
    entries: dict[str, str] = Field(default_factory=dict, alias="dict")
    revisedAt: str | None = None

    model_config = {"populate_by_name": True}


class MintRequest(BaseModel):
    note: str = ""
    adminToken: str = ""


class CheckoutRequest(BaseModel):
    successUrl: str = Field(default="", alias="success_url")
    cancelUrl: str = Field(default="", alias="cancel_url")
    email: str = ""

    model_config = {"populate_by_name": True}


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "yt-furigana-reading-engine",
        "docs": "/docs",
        "stripeConfigured": stripe_configured(),
        "freemium": {
            "free": ["local extension engines", "BYO localhost readings"],
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


@app.post("/v1/admin/mint-license")
def admin_mint(body: MintRequest) -> dict[str, Any]:
    expected = os.environ.get("YT_FURIGANA_ADMIN_TOKEN", "").strip()
    if not expected or body.adminToken != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    return mint_license(body.note)


@app.post("/v1/billing/checkout")
def billing_checkout(body: CheckoutRequest) -> dict[str, Any]:
    return create_checkout_session(
        success_url=body.successUrl,
        cancel_url=body.cancelUrl,
        customer_email=body.email or None,
    )


@app.get("/v1/billing/order")
def billing_order(session_id: str = "") -> dict[str, Any]:
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    order = get_order(session_id)
    if not order:
        raise HTTPException(status_code=404, detail="not_found")
    return {
        "sessionId": session_id,
        "licenseKey": order.get("licenseKey"),
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
