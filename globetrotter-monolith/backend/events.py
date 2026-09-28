from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlsplit

from flask import Blueprint, abort, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from database import get_session
from data_access import _destination_to_dict, _utc_iso
from models import AuditLog, Destination, EventInterest, LocalEvent


EVENT_CATEGORIES = ("music", "exhibition", "festival", "sport", "workshop", "other")
CAMEROON = timezone(timedelta(hours=1))


def event_payload(body):
    if not isinstance(body, dict):
        abort(400, description="A JSON object is required.")
    values = {}
    for field in ("title", "title_fr", "description", "description_fr"):
        value = body.get(field)
        maximum = 160 if field.startswith("title") else 4000
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= maximum:
            abort(400, description="Complete the event title and description in both languages.")
        values[field] = value.strip()
    if body.get("category") not in EVENT_CATEGORIES or body.get("status") not in ("draft", "published", "cancelled"):
        abort(400, description="Choose a valid event category and status.")
    values.update(category=body["category"], status=body["status"])
    try:
        for field in ("starts_at", "ends_at"):
            value = datetime.fromisoformat(body[field])
            if value.tzinfo is None:
                raise ValueError()
            values[field] = value.astimezone(timezone.utc)
        if not timedelta(0) < values["ends_at"] - values["starts_at"] <= timedelta(days=31):
            raise ValueError()
    except (KeyError, ValueError, TypeError, OverflowError):
        abort(400, description="Choose event times with a timezone, ending within 31 days.")
    price = body.get("price_fcfa")
    if price is not None and (type(price) is not int or not 0 <= price <= 10000000):
        abort(400, description="FCFA amounts must be whole numbers from 0 to 10000000.")
    values["price_fcfa"] = price
    source = body.get("source_url")
    try:
        parsed = urlsplit(source) if isinstance(source, str) else None
        if not parsed or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or len(source) > 500 or any(character.isspace() for character in source):
            raise ValueError()
    except ValueError:
        abort(400, description="Use an HTTPS event source link.")
    values["source_url"] = source
    if type(body.get("destination_id")) is not int:
        abort(400, description="Choose a valid place.")
    values["destination_id"] = body["destination_id"]
    return values


def event_dict(event, interested=False):
    return {"id": event.id, "title": event.title, "title_fr": event.title_fr,
            "description": event.description, "description_fr": event.description_fr,
            "category": event.category, "starts_at": _utc_iso(event.starts_at), "ends_at": _utc_iso(event.ends_at),
            "price_fcfa": event.price_fcfa, "source_url": event.source_url, "status": event.status,
            "version": event.version, "destination_id": event.destination_id,
            "destination": _destination_to_dict(event.destination), "interested": interested}


def register_events(app, require_auth, limiter):
    blueprint = Blueprint("events", __name__)

    @blueprint.errorhandler(IntegrityError)
    def conflict(error):
        return jsonify({"error": "This request changed. Please refresh."}), 409

    @blueprint.get("/events")
    @require_auth
    def list_events():
        admin = request.args.get("manage") == "1"
        if admin and request.user_role != "admin":
            abort(403, description="Administrator access required.")
        try:
            offset = int(request.args.get("offset", "0"))
            if not 0 <= offset <= 10000:
                raise ValueError()
            start = date.fromisoformat(request.args["from"]) if request.args.get("from") else datetime.now(CAMEROON).date()
            end = date.fromisoformat(request.args["to"]) if request.args.get("to") else start + timedelta(days=366)
            if end < start or (end - start).days > 366:
                raise ValueError()
        except (ValueError, OverflowError):
            abort(400, description="Choose a valid event date range.")
        with get_session() as session:
            saved_ids = {row.event_id for row in session.query(EventInterest).filter_by(user_id=request.user_id).all()}
            query = session.query(LocalEvent)
            if not admin:
                query = query.filter(LocalEvent.status.in_(("published", "cancelled")) if request.args.get("saved") == "1" else LocalEvent.status == "published")
            if request.args.get("saved") == "1":
                query = query.filter(LocalEvent.id.in_(saved_ids))
            if not admin:
                query = query.filter(LocalEvent.ends_at >= datetime.combine(start, time.min, CAMEROON), LocalEvent.starts_at < datetime.combine(end + timedelta(days=1), time.min, CAMEROON))
            category = request.args.get("category", "")
            if category:
                if category not in EVENT_CATEGORIES:
                    abort(400, description="Choose a valid event category and status.")
                query = query.filter(LocalEvent.category == category)
            search = request.args.get("q", "").strip()[:120]
            if search:
                query = query.filter(or_(LocalEvent.title.icontains(search, autoescape=True), LocalEvent.title_fr.icontains(search, autoescape=True)))
            rows = query.order_by(LocalEvent.starts_at, LocalEvent.id).offset(offset).limit(25).all()
            return jsonify({"items": [event_dict(event, event.id in saved_ids) for event in rows[:24]], "has_more": len(rows) > 24})

    @blueprint.route("/events/<int:event_id>/interest", methods=["PUT", "DELETE"])
    @require_auth
    @limiter.limit("60 per hour", key_func=lambda: str(request.user_id))
    def interest(event_id):
        with get_session() as session:
            event = session.get(LocalEvent, event_id)
            existing = session.get(EventInterest, (event_id, request.user_id))
            if not event or event.status == "draft" or (request.method == "PUT" and event.status != "published"):
                abort(404, description="Event unavailable.")
            if request.method == "PUT" and not existing:
                session.add(EventInterest(event_id=event_id, user_id=request.user_id))
            elif request.method == "DELETE" and existing:
                session.delete(existing)
        return jsonify({"interested": request.method == "PUT"})

    @blueprint.post("/admin/events")
    @blueprint.put("/admin/events/<int:event_id>")
    @require_auth
    def save_event(event_id=None):
        if request.user_role != "admin":
            abort(403, description="Administrator access required.")
        body = request.get_json(silent=True)
        values = event_payload(body)
        with get_session() as session:
            destination = session.get(Destination, values["destination_id"])
            if not destination or (destination.publication and not destination.publication.active):
                abort(400, description="Choose a valid place.")
            if event_id is None:
                event = LocalEvent(**values)
                session.add(event)
            else:
                version = body.get("version")
                if type(version) is not int or not 1 <= version < 2147483647:
                    abort(400, description="A valid edit version is required.")
                if not session.query(LocalEvent).filter_by(id=event_id, version=version).update({**values, "version": version + 1}, synchronize_session=False):
                    abort(409, description="This event has changed. Refresh before editing.")
                event = session.get(LocalEvent, event_id)
            session.flush()
            session.add(AuditLog(user_id=request.user_id, event_type="event_saved", detail=str(event.id)))
            result = event_dict(event)
        return jsonify(result), 201 if event_id is None else 200

    app.register_blueprint(blueprint)