import os
import jwt

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"


def decode_token(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
