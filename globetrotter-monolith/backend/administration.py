from datetime import datetime, timezone
from functools import wraps
import json
import math
from urllib.parse import urlsplit

import click
from flask import Blueprint, jsonify, request
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

import data_access as db
import fares
import recovery
from database import get_session
from models import AccountSecurity, AuditLog, ChatMessage, Destination, DestinationPublication, FarePolicy, Itinerary, User


DESTINATION_FIELDS = {"name", "category", "neighborhood", "address", "lat", "lng", "rating", "rating_count", "price_level", "phone", "tags", "description", "image_url", "description_fr", "active"}
CATEGORIES = {"restaurant", "hotel", "nature", "landmark", "attraction", "sports", "spa", "nightlife", "entertainment", "hospital", "school", "lake", "worship", "market", "government", "transport"}


def validate_destination(body):
    if not isinstance(body, dict) or set(body) != DESTINATION_FIELDS:
        return "All destination fields are required."
    for field, maximum in {"name": 200, "neighborhood": 100, "address": 300, "description": 6000, "description_fr": 6000}.items():
        if not isinstance(body[field], str) or not body[field].strip() or len(body[field]) > maximum:
            return "Complete both descriptions and the required place details."
    if not isinstance(body["category"], str) or body["category"] not in CATEGORIES or type(body["active"]) is not bool:
        return "Choose a valid category and publication status."
    for field, minimum, maximum in (("lat", -90, 90), ("lng", -180, 180), ("rating", 0, 5)):
        if type(body[field]) not in (int, float) or not math.isfinite(body[field]) or not minimum <= body[field] <= maximum:
            return "Coordinates or rating are out of range."
    if type(body["rating_count"]) is not int or not 0 <= body["rating_count"] <= 1000000 or (body["price_level"] is not None and (type(body["price_level"]) is not int or not 1 <= body["price_level"] <= 4)):
        return "Enter a valid rating count and price level."
    if body["phone"] is not None and (not isinstance(body["phone"], str) or len(body["phone"]) > 32):
        return "Enter a valid place phone number."
    tags = body["tags"]
    if not isinstance(tags, list) or len(tags) > 20 or any(not isinstance(tag, str) or not tag.strip() or len(tag) > 40 for tag in tags):
        return "Use at most 20 short tags."
    image = body["image_url"]
    if not isinstance(image, str) or len(image) > 500 or "\\" in image:
        return "Use a local image path or an HTTPS image URL."
    if image and not image.startswith("/images/"):
        try:
            parsed = urlsplit(image)
        except ValueError:
            return "Use a local image path or an HTTPS image URL."
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return "Use a local image path or an HTTPS image URL."
    return None


def add_audit(session, actor_id, action, entity, fields):
    session.add(AuditLog(user_id=actor_id, event_type=action, detail=json.dumps({"entity": entity, "fields": sorted(fields)}, ensure_ascii=True)))


def register_administration(app, require_auth):
    blueprint = Blueprint("administration", __name__, url_prefix="/admin")

    def require_admin(function):
        @wraps(function)
        @require_auth
        def checked(*args, **kwargs):
            if request.user_role != "admin":
                return jsonify({"error": "Administrator access is required."}), 403
            return function(*args, **kwargs)
        return checked

    @blueprint.get("/overview")
    @require_admin
    def overview():
        with get_session() as session:
            counts = {"users": session.scalar(select(func.count()).select_from(User)), "destinations": session.scalar(select(func.count()).select_from(Destination)), "plans": session.scalar(select(func.count()).select_from(Itinerary)), "messages": session.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.deleted.is_(False)))}
        return jsonify({"counts": counts, "recovery": recovery.delivery_channels()})

    @blueprint.get("/destinations")
    @require_admin
    def destinations():
        return jsonify(db.get_destinations(include_archived=True))

    @blueprint.route("/destinations", methods=["POST"])
    @blueprint.route("/destinations/<int:destination_id>", methods=["PATCH"])
    @require_admin
    def save_destination(destination_id=None):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "All destination fields are required."}), 400
        body = dict(payload)
        expected = body.pop("version", None)
        error = validate_destination(body)
        if error:
            return jsonify({"error": error}), 400
        if destination_id is not None and (type(expected) is not int or expected < 0):
            return jsonify({"error": "A valid edit version is required."}), 400
        if destination_id is None and expected not in (None, 0):
            return jsonify({"error": "A valid edit version is required."}), 400
        try:
            with get_session() as session:
                place = session.get(Destination, destination_id) if destination_id is not None else Destination()
                if place is None:
                    return jsonify({"error": "destination not found"}), 404
                publication = place.publication if destination_id is not None else None
                now = datetime.now(timezone.utc)
                if publication:
                    updated = session.execute(update(DestinationPublication).where(DestinationPublication.destination_id == destination_id, DestinationPublication.version == expected).values(active=body["active"], description_fr=body["description_fr"], version=expected + 1, updated_at=now))
                    if updated.rowcount != 1:
                        return jsonify({"error": "This record changed. Reload it before saving."}), 409
                else:
                    if destination_id is not None and expected != 0:
                        return jsonify({"error": "This record changed. Reload it before saving."}), 409
                    place.publication = DestinationPublication(active=body["active"], description_fr=body["description_fr"], version=1, updated_at=now)
                for field in DESTINATION_FIELDS - {"active", "description_fr"}:
                    setattr(place, field, body[field].strip() if isinstance(body[field], str) else body[field])
                session.add(place)
                session.flush()
                add_audit(session, request.user_id, "destination_updated" if destination_id else "destination_created", f"destination:{place.id}", body.keys())
                result = db._destination_to_dict(place)
            return jsonify(result), 200 if destination_id else 201
        except IntegrityError:
            return jsonify({"error": "This record changed. Reload it before saving."}), 409

    @blueprint.get("/fares")
    @require_admin
    def fare_list():
        return jsonify(fares.list_policies(include_inactive=True))

    @blueprint.put("/fares/<policy_id>")
    @require_admin
    def save_fare(policy_id):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "All fare policy fields are required."}), 400
        body = dict(payload)
        expected = body.pop("version", None)
        error = fares.validate_policy(body)
        if error or body["id"] != policy_id or type(expected) is not int or expected < 0:
            return jsonify({"error": error or "A valid edit version is required."}), 400
        try:
            with get_session() as session:
                policy = session.get(FarePolicy, policy_id)
                if policy:
                    result = session.execute(update(FarePolicy).where(FarePolicy.id == policy_id, FarePolicy.version == expected).values(data=body, version=expected + 1))
                    if result.rowcount != 1:
                        return jsonify({"error": "This record changed. Reload it before saving."}), 409
                else:
                    if expected != 0:
                        return jsonify({"error": "This record changed. Reload it before saving."}), 409
                    session.add(FarePolicy(id=policy_id, data=body, version=1))
                add_audit(session, request.user_id, "fare_updated", f"fare:{policy_id}", body.keys())
            return jsonify({**body, "version": expected + 1})
        except IntegrityError:
            return jsonify({"error": "This record changed. Reload it before saving."}), 409

    @blueprint.get("/audit")
    @require_admin
    def audit():
        before = request.args.get("before", type=int)
        with get_session() as session:
            query = session.query(AuditLog, User.name).outerjoin(User, AuditLog.user_id == User.id).order_by(AuditLog.id.desc())
            if before:
                query = query.filter(AuditLog.id < before)
            rows = query.limit(51).all()
            records = [{"id": entry.id, "actor": name, "event": entry.event_type, "detail": entry.detail, "created_at": db._utc_iso(entry.created_at)} for entry, name in rows[:50]]
        return jsonify({"records": records, "next_before": records[-1]["id"] if len(rows) > 50 else None})

    app.register_blueprint(blueprint)

    @app.cli.command("set-admin")
    @click.option("--user-id", type=int, required=True)
    @click.option("--remove", is_flag=True)
    @click.option("--confirm", is_flag=True, help="Confirm the role change for this user ID.")
    def set_admin(user_id, remove, confirm):
        if not confirm:
            raise click.ClickException("Review the target user ID, then repeat with --confirm.")
        with get_session() as session:
            if not session.get(User, user_id):
                raise click.ClickException("User not found.")
            security = session.get(AccountSecurity, user_id)
            if remove and security and security.role == "admin" and session.scalar(select(func.count()).select_from(AccountSecurity).where(AccountSecurity.role == "admin")) <= 1:
                raise click.ClickException("Create another administrator before removing the last one.")
            if not security:
                security = AccountSecurity(user_id=user_id, session_version=0, role="user")
                session.add(security)
            security.role = "user" if remove else "admin"
            security.session_version += 1
            add_audit(session, user_id, "role_changed", f"user:{user_id}", [security.role])
        click.echo("Role changed. The user must sign in again.")