"""
Auth — User Service is the ONLY service that touches passwords or
issues tokens. Every other service only decodes/verifies tokens using
the same shared secret (stateless JWT verification — no need to call
back to User Service on every request).
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


def issue_token(user_id, name):
    payload = {
        "sub": user_id,
        "name": name,
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
