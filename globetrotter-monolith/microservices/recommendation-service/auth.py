"""
This service never issues tokens or touches passwords — only User
Service does that. It just verifies tokens it receives, using the
same shared secret, so /recommendations can identify which user is
asking without calling back to User Service for every request.
"""
import os
import jwt

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"


def decode_token(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
