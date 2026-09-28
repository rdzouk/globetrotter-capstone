from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from database import get_session
from data_access import _utc_iso
from models import Comment, DayTrip, DirectMessage, Friendship, Itinerary, NotificationRead, TripMember
from safety import blocked_user_ids


def notification_feed(user_id):
    items = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    today = datetime.now(timezone(timedelta(hours=1))).date()
    with get_session() as session:
        hidden = blocked_user_ids(session, user_id)
        friendships = session.query(Friendship).filter(or_(
            Friendship.lower_user_id == user_id, Friendship.higher_user_id == user_id,
        )).all()
        for friendship in friendships:
            if not friendship.accepted and friendship.requested_by != user_id:
                actor = friendship.lower_user if friendship.lower_user_id != user_id else friendship.higher_user
                items.append({"id": f"friend:{friendship.id}:{_utc_iso(friendship.created_at)}", "kind": "friend_request",
                              "actor_name": actor.name, "title": "", "href": "/chat?view=friends",
                              "created_at": _utc_iso(friendship.created_at)})
        accepted = [friendship.id for friendship in friendships if friendship.accepted]
        messages = session.query(DirectMessage).filter(
            DirectMessage.friendship_id.in_(accepted), DirectMessage.user_id != user_id,
            DirectMessage.deleted.is_(False), DirectMessage.created_at >= cutoff,
        ).order_by(DirectMessage.id.desc()).limit(100).all()
        for message in messages:
            items.append({"id": f"message:{message.id}:{_utc_iso(message.created_at)}", "kind": "message",
                          "actor_name": message.user.name, "title": "",
                          "href": f"/chat?view=friends&friend={message.friendship_id}",
                          "created_at": _utc_iso(message.created_at)})
        parent = aliased(Comment)
        replies = session.query(Comment).join(parent, Comment.parent_comment_id == parent.id).filter(
            parent.user_id == user_id, Comment.user_id != user_id, Comment.created_at >= cutoff, ~Comment.user_id.in_(hidden), Comment.message != "",
        ).order_by(Comment.id.desc()).limit(100).all()
        for reply in replies:
            items.append({"id": f"reply:{reply.id}:{_utc_iso(reply.created_at)}", "kind": "reply", "actor_name": reply.user.name,
                          "title": reply.destination.name,
                          "href": f"/places/{reply.place_id}?tab=comments#comment-{reply.id}",
                          "created_at": _utc_iso(reply.created_at)})
        end = (today + timedelta(days=7)).isoformat()
        visits = session.query(Itinerary).filter(
            Itinerary.user_id == user_id, Itinerary.visited.is_(False),
            Itinerary.start_date >= today.isoformat(), Itinerary.start_date <= end,
        ).order_by(Itinerary.start_date).limit(100).all()
        for visit in visits:
            items.append({"id": f"visit:{visit.id}:{visit.start_date}:{_utc_iso(visit.created_at)}", "kind": "visit_reminder",
                          "actor_name": "", "title": visit.destination.name, "date": visit.start_date,
                          "href": "/itineraries", "created_at": f"{visit.start_date}T00:00:00+01:00"})
        memberships = session.query(TripMember).filter_by(user_id=user_id).all()
        for member in memberships:
            if not member.accepted:
                trip = session.get(DayTrip, member.day_trip_id)
                if trip:
                    items.append({"id": f"invitation:{trip.id}:{user_id}:{_utc_iso(member.created_at)}", "kind": "trip_invitation",
                                  "actor_name": trip.user.name, "title": trip.title, "href": "/day-trips",
                                  "created_at": _utc_iso(member.created_at)})
        trips = session.query(DayTrip).filter(
            or_(DayTrip.user_id == user_id, DayTrip.id.in_([member.day_trip_id for member in memberships if member.accepted])),
            DayTrip.trip_date >= today.isoformat(), DayTrip.trip_date <= end,
        ).order_by(DayTrip.trip_date).limit(100).all()
        for trip in trips:
            items.append({"id": f"trip:{trip.id}:{trip.trip_date}:{_utc_iso(trip.created_at)}", "kind": "trip_reminder",
                          "actor_name": "", "title": trip.title, "date": trip.trip_date,
                          "href": f"/day-trips?trip={trip.id}", "created_at": f"{trip.trip_date}T{trip.start_time}:00+01:00"})
        items.sort(key=lambda item: datetime.fromisoformat(item["created_at"]), reverse=True)
        items = items[:100]
        read_ids = {row.notification_id for row in session.query(NotificationRead).filter(
            NotificationRead.user_id == user_id, NotificationRead.notification_id.in_([item["id"] for item in items]),
        ).all()}
        for item in items:
            item["read"] = item["id"] in read_ids
    return {"items": items, "unread_count": sum(not item["read"] for item in items)}


def register_notifications(app, require_auth, limiter):
    blueprint = Blueprint("notifications", __name__)

    @blueprint.get("/notifications")
    @require_auth
    def notifications():
        return jsonify(notification_feed(request.user_id))

    @blueprint.post("/notifications/read")
    @require_auth
    @limiter.limit("60 per minute", key_func=lambda: str(request.user_id))
    def mark_read():
        body = request.get_json(silent=True)
        identifiers = body.get("ids") if isinstance(body, dict) else None
        if not isinstance(identifiers, list) or not 1 <= len(identifiers) <= 100 or any(
            not isinstance(identifier, str) or len(identifier) > 100 for identifier in identifiers
        ):
            return jsonify({"error": "Invalid notification selection."}), 400
        owned = {item["id"] for item in notification_feed(request.user_id)["items"]}
        if not set(identifiers).issubset(owned):
            return jsonify({"error": "Notification unavailable."}), 404
        try:
            with get_session() as session:
                for identifier in set(identifiers):
                    session.merge(NotificationRead(user_id=request.user_id, notification_id=identifier))
        except IntegrityError:
            return jsonify({"error": "This request changed. Please refresh."}), 409
        return jsonify({"marked": len(set(identifiers))})

    app.register_blueprint(blueprint)