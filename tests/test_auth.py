import os
import tempfile
import unittest
from pathlib import Path

from apps.api import auth


class _Req:
    def __init__(self, authorization: str | None = None):
        self.headers = {}
        if authorization is not None:
            self.headers["authorization"] = authorization


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "vaani.sqlite3"
        self.old_db = auth.DB_PATH
        self.old_jwt = auth.JWT_SECRET
        auth.DB_PATH = self.db_path
        auth.JWT_SECRET = "test-secret"
        auth.init_db()

    def tearDown(self):
        auth.DB_PATH = self.old_db
        auth.JWT_SECRET = self.old_jwt
        self.tmp.cleanup()

    def _insert_user(self, email="user@example.com", credits=999):
        with auth.db() as c:
            cur = c.execute(
                "INSERT INTO users (email, password_hash, credits) VALUES (?,?,?)",
                (email, auth._hash_password("supersecret"), credits),
            )
            user_id = cur.lastrowid
        return user_id

    def test_generate_api_key_format_and_hash(self):
        full, display, key_hash = auth._generate_api_key()
        self.assertTrue(full.startswith(auth.API_KEY_PREFIX))
        self.assertEqual(key_hash, auth._hash_api_key(full))
        self.assertIn("…", display)
        self.assertTrue(display.startswith(full[: len(auth.API_KEY_PREFIX) + 4]))
        self.assertTrue(display.endswith(full[-4:]))

    def test_verify_password_handles_invalid_hash(self):
        self.assertFalse(auth._verify_password("abc", "invalid-hash"))

    def test_user_from_api_key_returns_user_and_updates_last_used(self):
        user_id = self._insert_user()
        full, display, key_hash = auth._generate_api_key()
        with auth.db() as c:
            c.execute(
                "INSERT INTO api_keys (user_id, name, key_hash, key_display) VALUES (?,?,?,?)",
                (user_id, "test", key_hash, display),
            )

        user = auth._user_from_api_key(full)
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], user_id)

        with auth.db() as c:
            row = c.execute(
                "SELECT last_used_at FROM api_keys WHERE key_hash = ?", (key_hash,)
            ).fetchone()
        self.assertIsNotNone(row["last_used_at"])

    def test_current_user_supports_jwt_and_api_key(self):
        user_id = self._insert_user(email="jwt@example.com")
        jwt_token = auth._issue_token(user_id)
        jwt_user = auth.current_user(_Req(f"Bearer {jwt_token}"))
        self.assertEqual(jwt_user["id"], user_id)

        full, display, key_hash = auth._generate_api_key()
        with auth.db() as c:
            c.execute(
                "INSERT INTO api_keys (user_id, name, key_hash, key_display) VALUES (?,?,?,?)",
                (user_id, "api", key_hash, display),
            )
        key_user = auth.current_user(_Req(f"Bearer {full}"))
        self.assertEqual(key_user["id"], user_id)

    def test_current_user_rejects_invalid_or_missing_credentials(self):
        self.assertIsNone(auth.current_user(_Req()))
        self.assertIsNone(auth.current_user(_Req("Bearer not-a-real-token")))
        self.assertIsNone(auth.current_user(_Req("Basic abc")))


if __name__ == "__main__":
    unittest.main()
