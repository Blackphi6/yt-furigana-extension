"""Stripe Checkout → mint Premium license keys."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from reading_engine.premium import DATA_DIR, ensure_store, mint_license, _utcnow

ORDERS_FILE = DATA_DIR / "stripe-orders.json"


def stripe_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY", "").strip())


def _load_orders() -> dict[str, Any]:
    ensure_store()
    if not ORDERS_FILE.exists():
        return {}
    return json.loads(ORDERS_FILE.read_text(encoding="utf-8"))


def _save_orders(data: dict[str, Any]) -> None:
    ensure_store()
    ORDERS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def create_checkout_session(
    *,
    success_url: str,
    cancel_url: str,
    customer_email: str | None = None,
) -> dict[str, Any]:
    """
    Create a Stripe Checkout Session for Premium.
    Without STRIPE_SECRET_KEY, returns a dry-run session (local testing).
    """
    price_id = os.environ.get("STRIPE_PRICE_ID", "").strip()
    secret = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    site = os.environ.get(
        "YT_FURIGANA_SITE_URL",
        "https://blackphi6.github.io/yt-furigana-extension",
    ).rstrip("/")

    if not secret or not price_id:
        # Dry-run: mint immediately and send user to success page with session id
        minted = mint_license(note="dry-run-checkout")
        session_id = f"dry_{minted['licenseKey'][-12:]}"
        orders = _load_orders()
        orders[session_id] = {
            "licenseKey": minted["licenseKey"],
            "email": customer_email or "",
            "mode": "dry-run",
            "createdAt": _utcnow(),
        }
        _save_orders(orders)
        success = (success_url or "").strip()
        if success and "{CHECKOUT_SESSION_ID}" in success:
            success = success.replace("{CHECKOUT_SESSION_ID}", session_id)
        elif not success:
            success = f"{site}/success.html?session_id={session_id}&dry_run=1"
        elif "session_id=" not in success:
            sep = "&" if "?" in success else "?"
            success = f"{success}{sep}session_id={session_id}&dry_run=1"
        return {
            "mode": "dry-run",
            "dry_run": True,
            "sessionId": session_id,
            "url": success,
            "licenseKey": minted["licenseKey"],
        }

    import stripe

    stripe.api_key = secret
    params: dict[str, Any] = {
        "mode": "payment",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url
        or f"{site}/success.html?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": cancel_url or f"{site}/pricing.html?canceled=1",
        "metadata": {"product": "yt-furigana-premium"},
    }
    if customer_email:
        params["customer_email"] = customer_email

    session = stripe.checkout.Session.create(**params)
    return {
        "mode": "stripe",
        "sessionId": session.id,
        "url": session.url,
    }


def fulfill_checkout_session(session_id: str, email: str = "") -> dict[str, Any]:
    orders = _load_orders()
    if session_id in orders and orders[session_id].get("licenseKey"):
        return {"ok": True, **orders[session_id], "replay": True}

    minted = mint_license(note=f"stripe:{session_id}")
    record = {
        "licenseKey": minted["licenseKey"],
        "email": email or "",
        "mode": "stripe",
        "createdAt": _utcnow(),
        "sessionId": session_id,
    }
    orders[session_id] = record
    _save_orders(orders)
    return {"ok": True, **record, "replay": False}


def get_order(session_id: str) -> dict[str, Any] | None:
    orders = _load_orders()
    return orders.get(session_id)


def handle_stripe_webhook(payload: bytes, sig_header: str | None) -> dict[str, Any]:
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    api_key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not secret or not api_key:
        return {"ok": False, "error": "stripe_not_configured"}

    import stripe

    stripe.api_key = api_key
    try:
        event = stripe.Webhook.construct_event(payload, sig_header or "", secret)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"invalid_signature:{exc}"}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = session.get("id") or ""
        email = (session.get("customer_details") or {}).get("email") or session.get(
            "customer_email"
        ) or ""
        return fulfill_checkout_session(session_id, email)

    return {"ok": True, "ignored": event["type"]}
