import secrets
from functools import partial

from google.auth.transport.requests import Request
from google.oauth2 import id_token
from itsdangerous import URLSafeTimedSerializer

import config


def nonce_serializer():
    return URLSafeTimedSerializer(config.JWT_SECRET, salt="google-sign-in")


def create_nonce():
    return nonce_serializer().dumps(secrets.token_urlsafe(32))


def verify_google_credential(credential, nonce):
    nonce_serializer().loads(nonce, max_age=600)
    claims = id_token.verify_oauth2_token(
        credential, partial(Request(), timeout=10), audience=config.GOOGLE_CLIENT_ID,
    )
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Invalid Google issuer")
    if claims.get("email_verified") is not True:
        raise ValueError("Unverified Google email")
    if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(claims["nonce"], nonce):
        raise ValueError("Invalid Google nonce")
    if not isinstance(claims.get("sub"), str) or not 1 <= len(claims["sub"]) <= 255:
        raise ValueError("Invalid Google subject")
    if not isinstance(claims.get("email"), str) or not 3 <= len(claims["email"]) <= 320 or "@" not in claims["email"]:
        raise ValueError("Invalid Google email")
    return claims