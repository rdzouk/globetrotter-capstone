"""
Authentication
--------------
Simple JWT-based auth. Passwords are hashed with Werkzeug's
generate_password_hash (PBKDF2). In production this secret would come
from a secrets manager, not a hardcoded string.
"""
import datetime
import os
import jwt
from werkzeug.security import generate_password_hash, check_password_hash

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24


def hash_password(plain_password):
    return generate_password_hash(plain_password)


def verify_password(plain_password, hashed):
    return check_password_hash(hashed, plain_password)


def issue_token(user_id, username):
    payload = {
        "sub": user_id,
        "username": username,
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token):
    """Returns payload dict, or raises jwt exceptions on invalid/expired token."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
