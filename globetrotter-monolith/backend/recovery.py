import hashlib
import re
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import base64

from sqlalchemy import delete, select, update

import auth
import config
from database import get_session
from models import AccountSecurity, AuditLog, GoogleIdentity, PasswordReset, User


def delivery_channels():
    try:
        reset_url("configuration-check")
    except ValueError:
        return {"email": False, "phone": False}
    return {
        "email": bool(config.SMTP_HOST and config.SMTP_FROM and (config.SMTP_SECURITY in ("ssl", "starttls") or (config.SMTP_SECURITY == "none" and not config.IS_PRODUCTION and config.SMTP_HOST in ("localhost", "127.0.0.1")))),
        "phone": bool(re.fullmatch(r"AC[0-9a-fA-F]{32}", config.TWILIO_ACCOUNT_SID) and config.TWILIO_AUTH_TOKEN and config.TWILIO_FROM),
    }


def normalize_identity(value, channel):
    if not isinstance(value, str) or len(value) > 320:
        return None
    if channel == "email":
        return value.strip().lower() if re.fullmatch(r"[^\s@%]+@[^\s@%]+\.[^\s@%]+", value.strip()) else None
    if channel != "phone" or not re.fullmatch(r"[+\d\s()-]+", value):
        return None
    digits = re.sub(r"[\s()-]", "", value)
    if re.fullmatch(r"[26]\d{8}", digits):
        digits = "+237" + digits
    return digits if re.fullmatch(r"\+[1-9]\d{7,14}", digits) else None


def reset_url(token):
    origin = config.APP_PUBLIC_URL.rstrip("/")
    parsed = urlsplit(origin)
    if parsed.scheme not in ("https", "http") or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme == "http" and (config.IS_PRODUCTION or parsed.hostname not in ("localhost", "127.0.0.1"))):
        raise ValueError("Configure a trusted application URL for account recovery.")
    return f"{origin}/reset-password#token={token}"


def deliver_reset(identity, channel, link):
    message = f"GlobeTrotter: reset your password / Reinitialiser votre mot de passe (15 min): {link}"
    if channel == "email":
        email = EmailMessage()
        email["Subject"] = "GlobeTrotter - Password reset / Mot de passe"
        email["From"] = config.SMTP_FROM
        email["To"] = identity
        email.set_content(message + "\n\nIgnore this message if you did not request it. / Ignorez ce message si vous n'etes pas a l'origine de la demande.")
        context = ssl.create_default_context()
        if config.SMTP_SECURITY == "ssl":
            connection = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10, context=context)
        else:
            connection = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        with connection:
            if config.SMTP_SECURITY == "starttls":
                connection.starttls(context=context)
            elif config.SMTP_SECURITY != "ssl" and (config.IS_PRODUCTION or config.SMTP_HOST not in ("localhost", "127.0.0.1")):
                raise ValueError("Recovery mail requires encrypted delivery.")
            if config.SMTP_USERNAME:
                connection.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            connection.send_message(email)
    else:
        credentials = base64.b64encode(f"{config.TWILIO_ACCOUNT_SID}:{config.TWILIO_AUTH_TOKEN}".encode()).decode()
        payload = urlencode({"To": identity, "From": config.TWILIO_FROM, "Body": message}).encode()
        request = Request(f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json", data=payload, headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"})
        with urlopen(request, timeout=10) as response:
            if response.status not in (200, 201):
                raise RuntimeError("Recovery delivery failed.")


def request_reset(identity, channel):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    link = reset_url(token)
    now = datetime.now(timezone.utc)
    with get_session() as session:
        session.execute(delete(PasswordReset).where(PasswordReset.expires_at <= now))
        if channel == "email":
            from sqlalchemy import func
            user = session.scalar(select(User).where(func.lower(User.email) == identity))
        else:
            matches = [item for item in session.scalars(select(User).where(User.phone.isnot(None))) if normalize_identity(item.phone, "phone") == identity]
            user = matches[0] if len(matches) == 1 else None
        if not user or session.scalar(select(GoogleIdentity.id).where(GoogleIdentity.user_id == user.id)):
            return
        recent = session.scalar(select(PasswordReset.token_hash).where(PasswordReset.user_id == user.id, PasswordReset.expires_at > now + timedelta(minutes=14)))
        if recent:
            return
        session.add(PasswordReset(token_hash=token_hash, user_id=user.id, password_fingerprint=hashlib.sha256(user.password_hash.encode()).hexdigest(), expires_at=now + timedelta(minutes=15)))
    try:
        deliver_reset(identity, channel, link)
    except Exception:
        with get_session() as session:
            session.execute(delete(PasswordReset).where(PasswordReset.token_hash == token_hash))
        raise


def complete_reset(token, password):
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return False
    hashed_password = auth.hash_password(password)
    now = datetime.now(timezone.utc)
    with get_session() as session:
        reset = session.get(PasswordReset, hashlib.sha256(token.encode()).hexdigest())
        if not reset:
            return False
        expires = reset.expires_at.replace(tzinfo=timezone.utc) if reset.expires_at.tzinfo is None else reset.expires_at
        user = session.get(User, reset.user_id)
        if expires <= now or not user or not secrets.compare_digest(reset.password_fingerprint, hashlib.sha256(user.password_hash.encode()).hexdigest()):
            return False
        claimed = session.execute(update(User).where(User.id == user.id, User.password_hash == user.password_hash).values(password_hash=hashed_password).execution_options(synchronize_session=False))
        if claimed.rowcount != 1:
            return False
        security = session.get(AccountSecurity, user.id)
        if security:
            security.session_version += 1
        else:
            session.add(AccountSecurity(user_id=user.id, session_version=1, role="user"))
        session.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
        session.add(AuditLog(user_id=user.id, event_type="password_reset", detail="Password reset completed; previous sessions revoked."))
    return True