import asyncio
import base64
import hashlib
import hmac
import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from apps.api import auth, billing


class _BodyRequest:
    def __init__(self, body: bytes):
        self._body = body

    async def body(self):
        return self._body


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "vaani.sqlite3"
        self.old_db = auth.DB_PATH
        self.old_secret = billing.CF_SECRET
        self.old_app = billing.CF_APP_ID
        auth.DB_PATH = self.db_path
        billing.CF_SECRET = "webhook-secret"
        auth.init_db()

    def tearDown(self):
        auth.DB_PATH = self.old_db
        billing.CF_SECRET = self.old_secret
        billing.CF_APP_ID = self.old_app
        self.tmp.cleanup()

    def _insert_user_and_payment(self, *, credits=500, status="CREATED"):
        with auth.db() as c:
            user = c.execute(
                "INSERT INTO users (email, password_hash, credits) VALUES (?,?,?)",
                ("billing@example.com", auth._hash_password("supersecret"), 100),
            ).lastrowid
            c.execute(
                """
                INSERT INTO payments (user_id, order_id, package_id, amount_inr, credits, status)
                VALUES (?,?,?,?,?,?)
                """,
                (user, "ord_1", "starter", 99.0, credits, status),
            )
        return user

    def test_cf_headers_require_credentials(self):
        billing.CF_APP_ID = ""
        billing.CF_SECRET = ""
        with self.assertRaises(HTTPException) as ctx:
            billing._cf_headers()
        self.assertEqual(ctx.exception.status_code, 503)

        billing.CF_APP_ID = "app-id"
        billing.CF_SECRET = "secret"
        headers = billing._cf_headers()
        self.assertEqual(headers["x-client-id"], "app-id")
        self.assertEqual(headers["x-client-secret"], "secret")

    def test_verify_webhook_signature(self):
        ts = "1700000000"
        raw = b'{"ok":true}'
        digest = hmac.new(
            billing.CF_SECRET.encode("utf-8"),
            (ts + raw.decode("utf-8")).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        sig = base64.b64encode(digest).decode("utf-8")
        self.assertTrue(billing._verify_webhook(ts, raw, sig))
        self.assertFalse(billing._verify_webhook(ts, raw, "bad-signature"))

    def test_checkout_rejects_unknown_package(self):
        with self.assertRaises(HTTPException) as ctx:
            billing.checkout(
                billing.CheckoutReq(package_id="unknown"),
                user={"id": 1, "email": "u@example.com", "display_name": None},
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_webhook_success_is_idempotent_and_credits_once(self):
        user_id = self._insert_user_and_payment()
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {
                "order": {"order_id": "ord_1", "order_status": "PAID"},
                "payment": {"payment_status": "SUCCESS"},
            },
        }
        raw = json.dumps(payload).encode("utf-8")
        ts = "1700000000"
        digest = hmac.new(
            billing.CF_SECRET.encode("utf-8"),
            (ts + raw.decode("utf-8")).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        sig = base64.b64encode(digest).decode("utf-8")

        out1 = asyncio.run(
            billing.webhook(_BodyRequest(raw), x_webhook_signature=sig, x_webhook_timestamp=ts)
        )
        out2 = asyncio.run(
            billing.webhook(_BodyRequest(raw), x_webhook_signature=sig, x_webhook_timestamp=ts)
        )
        self.assertEqual(out1, {"ok": True})
        self.assertEqual(out2, {"ok": True})

        with auth.db() as c:
            user_row = c.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()
            pay_row = c.execute("SELECT status FROM payments WHERE order_id = 'ord_1'").fetchone()
        self.assertEqual(user_row["credits"], 600)
        self.assertEqual(pay_row["status"], "PAID")

    def test_webhook_failure_marks_created_payment_failed(self):
        self._insert_user_and_payment(status="CREATED")
        payload = {
            "type": "PAYMENT_FAILED_WEBHOOK",
            "data": {
                "order": {"order_id": "ord_1", "order_status": "FAILED"},
                "payment": {"payment_status": "FAILED"},
            },
        }
        raw = json.dumps(payload).encode("utf-8")
        ts = "1700000001"
        digest = hmac.new(
            billing.CF_SECRET.encode("utf-8"),
            (ts + raw.decode("utf-8")).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        sig = base64.b64encode(digest).decode("utf-8")

        out = asyncio.run(
            billing.webhook(_BodyRequest(raw), x_webhook_signature=sig, x_webhook_timestamp=ts)
        )
        self.assertEqual(out, {"ok": True})

        with auth.db() as c:
            pay_row = c.execute("SELECT status FROM payments WHERE order_id = 'ord_1'").fetchone()
        self.assertEqual(pay_row["status"], "FAILED")


if __name__ == "__main__":
    unittest.main()
