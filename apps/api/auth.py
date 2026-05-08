"""Auth subsystem — SQLite users, JWT sessions, Google ID-token verification.

Endpoints (mounted under /v1/auth):
    POST /signup   {email, password, display_name?}  -> {token, user}
    POST /login    {email, password}                 -> {token, user}
    POST /google   {credential}  (Google ID token)   -> {token, user}
    GET  /me       (Authorization: Bearer <token>)   -> {user}
    POST /logout                                     -> {ok: true}

JWT: HS256, 7-day TTL, secret from VAANI_JWT_SECRET env.
DB:  ~/vaani/data/vaani.sqlite3 (auto-created).
"""
from __future__ import annotations

import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr, Field

log = structlog.get_logger()

DB_PATH = Path(
    os.environ.get(
        "VAANI_DB_PATH", os.path.expanduser("~/vaani/data/vaani.sqlite3")
    )
)
JWT_SECRET = os.environ.get("VAANI_JWT_SECRET", "")
JWT_ALGO = "HS256"
JWT_TTL_SECONDS = 7 * 24 * 3600
GOOGLE_CLIENT_ID = os.environ.get(
    "VAANI_GOOGLE_CLIENT_ID",
    "546289365103-n34acbu7chavctqf2p15vov4alvdaeq4.apps.googleusercontent.com",
)


# ---------- DB ---------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                google_sub    TEXT UNIQUE,
                display_name  TEXT,
                picture_url   TEXT,
                credits       INTEGER NOT NULL DEFAULT 999,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
            """
        )
    log.info("auth_db_ready", path=str(DB_PATH))


# ---------- helpers ----------------------------------------------------------

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _issue_token(user_id: int) -> str:
    if not JWT_SECRET:
        raise RuntimeError("VAANI_JWT_SECRET not set")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=JWT_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


def _row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "picture_url": row["picture_url"],
        "credits": row["credits"],
        "has_google": bool(row["google_sub"]),
    }


# ---------- request models ---------------------------------------------------

class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=80)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleReq(BaseModel):
    credential: str  # Google ID token (JWT)


# ---------- dependency -------------------------------------------------------

def current_user(request: Request) -> Optional[dict]:
    """Return the user dict if a valid Bearer token is present, else None.

    Routes that require auth should raise themselves; this helper is a soft
    accessor used by /me and (later) by metering middleware."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        payload = _decode_token(token)
    except jwt.PyJWTError:
        return None
    user_id = int(payload.get("sub", "0"))
    if not user_id:
        return None
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def required_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(401, "authentication required")
    return user


# ---------- router -----------------------------------------------------------

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/signup")
def signup(req: SignupReq):
    email = req.email.lower().strip()
    pw_hash = _hash_password(req.password)
    with db() as c:
        existing = c.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        if existing:
            raise HTTPException(409, "email already registered")
        cur = c.execute(
            "INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)",
            (email, pw_hash, req.display_name),
        )
        user_id = cur.lastrowid
        row = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    log.info("user_signup", user_id=user_id, email=email)
    return {"token": _issue_token(user_id), "user": _row_to_user(row)}


@router.post("/login")
def login(req: LoginReq):
    email = req.email.lower().strip()
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not row["password_hash"]:
        raise HTTPException(401, "invalid credentials")
    if not _verify_password(req.password, row["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    log.info("user_login", user_id=row["id"], email=email)
    return {"token": _issue_token(row["id"]), "user": _row_to_user(row)}


@router.post("/google")
def google(req: GoogleReq):
    try:
        info = google_id_token.verify_oauth2_token(
            req.credential, g_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(401, f"invalid google token: {e}")

    sub = info.get("sub")
    email = (info.get("email") or "").lower().strip()
    display = info.get("name")
    picture = info.get("picture")
    if not sub or not email:
        raise HTTPException(401, "google token missing sub/email")
    if not info.get("email_verified", False):
        raise HTTPException(401, "google email not verified")

    with db() as c:
        row = c.execute(
            "SELECT * FROM users WHERE google_sub = ? OR email = ?", (sub, email)
        ).fetchone()
        if row is None:
            cur = c.execute(
                "INSERT INTO users (email, google_sub, display_name, picture_url) VALUES (?,?,?,?)",
                (email, sub, display, picture),
            )
            user_id = cur.lastrowid
        else:
            user_id = row["id"]
            # Link google_sub to an existing email-only account, refresh profile.
            c.execute(
                "UPDATE users SET google_sub = ?, display_name = COALESCE(?, display_name), picture_url = COALESCE(?, picture_url) WHERE id = ?",
                (sub, display, picture, user_id),
            )
        row = c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    log.info("user_google_login", user_id=user_id, email=email)
    return {"token": _issue_token(user_id), "user": _row_to_user(row)}


@router.get("/me")
def me(user: dict = Depends(required_user)):
    return {"user": user}


@router.post("/logout")
def logout():
    # Stateless JWT — client drops the token. Reserved for future blocklist.
    return {"ok": True}
