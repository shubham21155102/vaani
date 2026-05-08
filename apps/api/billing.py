"""Cashfree Payment Gateway integration — credit top-ups.

Endpoints (mounted at /v1/billing):
    GET  /packages              public — credit-package menu
    POST /checkout              auth   — creates Cashfree order, returns session id
    POST /webhook               Cashfree -> us, signature-verified, idempotent
    GET  /payments              auth   — user's payment history

Credentials live in ~/vaani/.env (loaded by systemd EnvironmentFile=).
The webhook URL to register in Cashfree dashboard:
    https://vaani-api.shubhamiitbhu.in/v1/billing/webhook
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from . import auth as auth_module

log = structlog.get_logger()

CF_BASE = os.environ.get("VAANI_CASHFREE_BASE", "https://api.cashfree.com").rstrip("/")
CF_APP_ID = os.environ.get("VAANI_CASHFREE_APP_ID", "")
CF_SECRET = os.environ.get("VAANI_CASHFREE_SECRET", "")
CF_API_VERSION = os.environ.get("VAANI_CASHFREE_API_VERSION", "2023-08-01")
PUBLIC_BASE = os.environ.get(
    "VAANI_PUBLIC_BASE", "https://vaani.shubhamiitbhu.in"
).rstrip("/")
API_BASE = "https://vaani-api.shubhamiitbhu.in"


# Default catalogue. Edit here to change pricing.
PACKAGES: list[dict] = [
    {"id": "starter",   "credits": 1_000,  "amount_inr":  99.0, "label": "Starter"},
    {"id": "growth",    "credits": 5_000,  "amount_inr": 399.0, "label": "Growth"},
    {"id": "pro",       "credits": 15_000, "amount_inr": 999.0, "label": "Pro"},
]
PACKAGES_BY_ID = {p["id"]: p for p in PACKAGES}


router = APIRouter(prefix="/v1/billing", tags=["billing"])


# ---------- request models ---------------------------------------------------

class CheckoutReq(BaseModel):
    package_id: str = Field(..., min_length=1, max_length=40)


# ---------- helpers ----------------------------------------------------------

def _cf_headers() -> dict:
    if not (CF_APP_ID and CF_SECRET):
        raise HTTPException(503, "billing: cashfree credentials not configured")
    return {
        "x-api-version": CF_API_VERSION,
        "x-client-id": CF_APP_ID,
        "x-client-secret": CF_SECRET,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _cf_post(path: str, body: dict, timeout: int = 30) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{CF_BASE}{path}",
        data=data,
        headers=_cf_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")[:500]
        log.warning("cashfree_http_error", code=e.code, body=text)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"message": text}
        raise HTTPException(
            502,
            f"cashfree {e.code}: {payload.get('message', text)}",
        )
    except urllib.error.URLError as e:
        raise HTTPException(503, f"cashfree unavailable: {e.reason}")


def _make_order_id(user_id: int) -> str:
    # Cashfree allows alphanumeric + _ + - up to 50 chars.
    return f"vaani-{user_id}-{int(time.time())}-{uuid.uuid4().hex[:6]}"


def _verify_webhook(timestamp: str, raw_body: bytes, signature: str) -> bool:
    """Cashfree v3 signature: base64(HMAC-SHA256(secret, timestamp + raw_body))."""
    if not CF_SECRET:
        return False
    digest = hmac.new(
        CF_SECRET.encode("utf-8"),
        (timestamp + raw_body.decode("utf-8")).encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature)


# ---------- endpoints --------------------------------------------------------

@router.get("/packages")
def packages():
    return {"packages": PACKAGES, "currency": "INR"}


@router.get("/payments")
def list_payments(user: dict = Depends(auth_module.required_user)):
    with auth_module.db() as c:
        rows = c.execute(
            """
            SELECT order_id, package_id, amount_inr, credits, status, created_at, paid_at
            FROM payments
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (user["id"],),
        ).fetchall()
    return {"payments": [dict(r) for r in rows]}


@router.post("/checkout")
def checkout(req: CheckoutReq, user: dict = Depends(auth_module.required_user)):
    pkg = PACKAGES_BY_ID.get(req.package_id)
    if not pkg:
        raise HTTPException(400, f"unknown package '{req.package_id}'")

    order_id = _make_order_id(user["id"])
    body = {
        "order_id": order_id,
        "order_amount": pkg["amount_inr"],
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"user{user['id']}",
            "customer_email": user["email"],
            "customer_phone": "9999999999",  # Cashfree requires; we don't collect.
            "customer_name": user.get("display_name") or user["email"].split("@")[0],
        },
        "order_meta": {
            "return_url": f"{PUBLIC_BASE}/usage?order_id={{order_id}}",
            "notify_url": f"{API_BASE}/v1/billing/webhook",
        },
        "order_note": f"Vaani credits — {pkg['credits']} ({pkg['label']})",
    }
    out = _cf_post("/pg/orders", body)

    with auth_module.db() as c:
        c.execute(
            """
            INSERT INTO payments (user_id, order_id, cf_order_id, package_id,
                                  amount_inr, credits, status)
            VALUES (?,?,?,?,?,?, 'CREATED')
            """,
            (
                user["id"],
                order_id,
                out.get("cf_order_id"),
                req.package_id,
                pkg["amount_inr"],
                pkg["credits"],
            ),
        )

    log.info(
        "checkout_created",
        user_id=user["id"],
        order_id=order_id,
        amount=pkg["amount_inr"],
    )
    return {
        "order_id": order_id,
        "payment_session_id": out.get("payment_session_id"),
        "amount_inr": pkg["amount_inr"],
        "credits": pkg["credits"],
    }


@router.post("/webhook")
async def webhook(
    request: Request,
    x_webhook_signature: Optional[str] = Header(default=None),
    x_webhook_timestamp: Optional[str] = Header(default=None),
):
    raw = await request.body()
    if not (x_webhook_signature and x_webhook_timestamp):
        raise HTTPException(400, "missing signature headers")
    if not _verify_webhook(x_webhook_timestamp, raw, x_webhook_signature):
        log.warning("webhook_bad_signature")
        raise HTTPException(401, "bad signature")

    try:
        evt = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(400, "invalid json")

    evt_type = evt.get("type") or ""
    data = evt.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    order_id = order.get("order_id")
    payment_status = payment.get("payment_status") or order.get("order_status")

    log.info("webhook_received", type=evt_type, order_id=order_id, status=payment_status)
    if not order_id:
        return {"ok": True}

    success = evt_type in (
        "PAYMENT_SUCCESS_WEBHOOK",
        "PAYMENT_USER_DROPPED_WEBHOOK",
    ) and payment_status == "SUCCESS"

    with auth_module.db() as c:
        row = c.execute(
            "SELECT * FROM payments WHERE order_id = ?", (order_id,)
        ).fetchone()
        if not row:
            log.warning("webhook_unknown_order", order_id=order_id)
            return {"ok": True}

        # Idempotency: only credit once on PAID transition.
        if success and row["status"] != "PAID":
            c.execute(
                "UPDATE payments SET status='PAID', paid_at=datetime('now') WHERE id=?",
                (row["id"],),
            )
            c.execute(
                "UPDATE users SET credits = credits + ? WHERE id = ?",
                (row["credits"], row["user_id"]),
            )
            log.info(
                "credits_granted",
                user_id=row["user_id"],
                credits=row["credits"],
                order_id=order_id,
            )
        elif not success and row["status"] == "CREATED":
            c.execute(
                "UPDATE payments SET status='FAILED' WHERE id=?", (row["id"],)
            )

    return {"ok": True}
