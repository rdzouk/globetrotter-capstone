from datetime import datetime, timezone
from io import BytesIO

from flask import Blueprint, abort, jsonify, request, send_file
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from database import get_session
from models import AuditLog, ChatMessage, Comment, ContentReport, DayTrip, DestinationContribution, DestinationPhoto, DirectMessage, Friendship, TripMember, User, UserBlock


REPORT_TARGETS = {"chat": ChatMessage, "message": DirectMessage, "comment": Comment, "photo": DestinationPhoto}
REPORT_REASONS = ("spam", "harassment", "inappropriate", "privacy", "other")


def blocked_user_ids(session, user_id):
    if user_id is None:
        return set()
    rows = session.query(UserBlock).filter(or_(UserBlock.user_id == user_id, UserBlock.blocked_user_id == user_id)).all()
    return {row.blocked_user_id if row.user_id == user_id else row.user_id for row in rows}


def _timestamp(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()


def visible_report_target(session, kind, target_id, user_id):
    model = REPORT_TARGETS.get(kind)
    target = session.get(model, target_id) if model else None
    if not target or target.user_id == user_id or target.user_id in blocked_user_ids(session, user_id) or getattr(target, "deleted", False):
        abort(404, description="Content unavailable.")
    if kind == "message":
        friendship = session.get(Friendship, target.friendship_id)
        if not friendship or not friendship.accepted or user_id not in (friendship.lower_user_id, friendship.higher_user_id):
            abort(404, description="Content unavailable.")
    return target


def remove_reported_content(session, report):
    target = session.get(REPORT_TARGETS[report.target_type], report.target_id)
    if not target or target.user_id != report.snapshot["user_id"] or _timestamp(target.created_at) != report.snapshot["created_at"]:
        return
    if report.target_type == "photo":
        contribution = session.get(DestinationContribution, target.destination_id)
        if contribution and contribution.cover_photo_id == target.id:
            next_photo = session.query(DestinationPhoto.id).filter(DestinationPhoto.destination_id == target.destination_id, DestinationPhoto.id != target.id).order_by(DestinationPhoto.id).first()
            contribution.cover_photo_id = next_photo[0] if next_photo else None
            session.flush()
        session.delete(target)
    else:
        target.message = ""
        if report.target_type != "comment":
            target.deleted = True
        if report.target_type == "message":
            target.audio, target.audio_type, target.duration = None, None, None


def register_safety(app, require_auth, limiter):
    blueprint = Blueprint("safety", __name__)

    @blueprint.errorhandler(IntegrityError)
    def conflict(error):
        return jsonify({"error": "This request changed. Please refresh."}), 409

    @blueprint.get("/blocks")
    @require_auth
    def list_blocks():
        with get_session() as session:
            rows = session.query(UserBlock, User).join(User, UserBlock.blocked_user_id == User.id).filter(UserBlock.user_id == request.user_id).order_by(UserBlock.created_at.desc()).all()
            return jsonify([{"user_id": user.id, "name": user.name} for block, user in rows])

    @blueprint.route("/blocks/<int:user_id>", methods=["PUT", "DELETE"])
    @require_auth
    @limiter.limit("60 per hour", key_func=lambda: str(request.user_id))
    def block(user_id):
        if user_id == request.user_id:
            abort(400, description="Choose another traveler.")
        with get_session() as session:
            if not session.get(User, user_id):
                abort(404, description="Traveler unavailable.")
            existing = session.get(UserBlock, (request.user_id, user_id))
            if request.method == "DELETE":
                if existing:
                    session.delete(existing)
            else:
                if not existing:
                    session.add(UserBlock(user_id=request.user_id, blocked_user_id=user_id))
                lower_id, higher_id = sorted((request.user_id, user_id))
                friendship = session.query(Friendship).filter_by(lower_user_id=lower_id, higher_user_id=higher_id).first()
                if friendship:
                    session.delete(friendship)
                memberships = session.query(TripMember).join(DayTrip, TripMember.day_trip_id == DayTrip.id).filter(or_(
                    (DayTrip.user_id == request.user_id) & (TripMember.user_id == user_id),
                    (DayTrip.user_id == user_id) & (TripMember.user_id == request.user_id),
                )).all()
                for member in memberships:
                    session.delete(member)
        return jsonify({"blocked": request.method == "PUT"})

    @blueprint.post("/reports")
    @require_auth
    @limiter.limit("10 per hour;20 per day", key_func=lambda: str(request.user_id))
    def report_content():
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get("target_type"), str) or body["target_type"] not in REPORT_TARGETS or type(body.get("target_id")) is not int:
            abort(400, description="Choose valid content to report.")
        if body.get("reason") not in REPORT_REASONS or not isinstance(body.get("details", ""), str) or len(body.get("details", "")) > 1000:
            abort(400, description="Choose a report reason and use at most 1000 characters.")
        with get_session() as session:
            existing = session.query(ContentReport).filter_by(reporter_id=request.user_id, target_type=body["target_type"], target_id=body["target_id"]).first()
            if existing:
                return jsonify({"id": existing.id, "status": existing.status}), 200
            target = visible_report_target(session, body["target_type"], body["target_id"], request.user_id)
            evidence = target.image if body["target_type"] == "photo" else target.audio if body["target_type"] == "message" else None
            evidence_type = "image/jpeg" if body["target_type"] == "photo" else target.audio_type if body["target_type"] == "message" else None
            report = ContentReport(reporter_id=request.user_id, target_type=body["target_type"], target_id=target.id,
                                   reason=body["reason"], details=body.get("details", "").strip(), evidence=evidence, evidence_type=evidence_type,
                                   snapshot={"user_id": target.user_id, "name": target.user.name if target.user else "Former user",
                                             "message": getattr(target, "message", getattr(target, "caption", "")), "created_at": _timestamp(target.created_at)})
            session.add(report)
            session.flush()
            result = {"id": report.id, "status": report.status}
        return jsonify(result), 201

    @blueprint.get("/admin/reports")
    @require_auth
    def reports():
        if request.user_role != "admin":
            abort(403, description="Administrator access required.")
        status = request.args.get("status", "open")
        try:
            before = int(request.args["before_id"]) if "before_id" in request.args else None
            if status not in ("open", "dismissed", "removed") or (before is not None and before < 1):
                raise ValueError()
        except ValueError:
            abort(400, description="Invalid report filters.")
        with get_session() as session:
            query = session.query(ContentReport).filter_by(status=status)
            if before:
                query = query.filter(ContentReport.id < before)
            rows = query.order_by(ContentReport.id.desc()).limit(26).all()
            return jsonify({"items": [{"id": row.id, "target_type": row.target_type, "reason": row.reason, "details": row.details,
                                       "snapshot": row.snapshot, "status": row.status, "created_at": _timestamp(row.created_at),
                                       "media_type": row.evidence_type, "media_url": f"/admin/reports/{row.id}/evidence" if row.evidence_type else None} for row in rows[:25]],
                            "next_before": rows[24].id if len(rows) > 25 else None})

    @blueprint.get("/admin/reports/<int:report_id>/evidence")
    @require_auth
    def evidence(report_id):
        if request.user_role != "admin":
            abort(403, description="Administrator access required.")
        with get_session() as session:
            report = session.get(ContentReport, report_id)
            if not report or not report.evidence_type or not report.evidence:
                abort(404, description="Content unavailable.")
            return send_file(BytesIO(report.evidence), mimetype=report.evidence_type, max_age=0)

    @blueprint.patch("/admin/reports/<int:report_id>")
    @require_auth
    def resolve(report_id):
        if request.user_role != "admin":
            abort(403, description="Administrator access required.")
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or body.get("action") not in ("dismiss", "remove"):
            abort(400, description="Choose a valid moderation action.")
        with get_session() as session:
            report = session.get(ContentReport, report_id)
            if not report:
                abort(404, description="Report unavailable.")
            status = "dismissed" if body["action"] == "dismiss" else "removed"
            if not session.query(ContentReport).filter_by(id=report_id, status="open").update({"status": status, "resolved_at": datetime.now(timezone.utc), "resolved_by": request.user_id}, synchronize_session=False):
                abort(409, description="This report has already been reviewed.")
            if status == "removed":
                remove_reported_content(session, report)
            session.add(AuditLog(user_id=request.user_id, event_type="report_" + status, detail=str(report_id)))
        return jsonify({"status": status})

    app.register_blueprint(blueprint)