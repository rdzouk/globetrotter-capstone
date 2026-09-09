"""
Data Access Layer — PostgreSQL/SQLAlchemy version.

Functions return plain dictionaries rather than ORM objects so the
API and business logic remain independent of database sessions.

Ownership is enforced here, not trusted from the caller: every
per-user query filters by the user_id passed in (which callers only
ever get from the authenticated request, never from client input).
"""
from datetime import timezone

from sqlalchemy import func
from sqlalchemy.orm import aliased, joinedload

from database import get_session
from models import User, Destination, Itinerary, Favorite, Feedback, Comment, GoogleIdentity, ChatMessage


def _utc_iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value and value.tzinfo is None else value.isoformat() if value else None


# ---- Conversion helpers: ORM object -> plain dict ----

def _user_to_dict(u):
    return {
        "id": u.id, "name": u.name, "email": u.email, "phone": u.phone,
        "password_hash": u.password_hash, "preferences": u.preferences,
    }


def _destination_to_dict(d):
    return {
        "id": d.id, "name": d.name, "category": d.category, "neighborhood": d.neighborhood,
        "address": d.address, "lat": d.lat, "lng": d.lng, "rating": d.rating,
        "rating_count": d.rating_count, "price_level": d.price_level, "phone": d.phone,
        "tags": d.tags, "description": d.description, "image_url": d.image_url,
    }


def _itinerary_to_dict(i):
    review = None
    if i.review_rating is not None:
        review = {"rating": i.review_rating, "comment": i.review_comment, "visited_date": i.review_visited_date}
    return {
        "id": i.id, "user_id": i.user_id, "destination_id": i.destination_id,
        "start_date": i.start_date, "end_date": i.end_date, "time_slot": i.time_slot,
        "transport_mode": i.transport_mode, "notes": i.notes, "shared_with": i.shared_with,
        "visited": i.visited, "review": review,
    }


def _feedback_to_dict(f):
    return {"id": f.id, "user_id": f.user_id, "user_name": f.user_name, "message": f.message, "rating": f.rating}


def _favorite_to_dict(f):
    return {"id": f.id, "user_id": f.user_id, "destination_id": f.destination_id}


def _comment_to_dict(c):
    return {
        "id": c.id,
        "place_id": c.place_id,
        "user_id": c.user_id,
        "user_name": c.user.name if c.user else "Former user",
        "parent_comment_id": c.parent_comment_id,
        "message": c.message,
        "created_at": _utc_iso(c.created_at),
        "replies": [],
    }


# ---- Users ----

def get_users():
    with get_session() as s:
        return [_user_to_dict(u) for u in s.query(User).all()]


def get_user_by_email(email):
    if not email:
        return None
    with get_session() as s:
        u = s.query(User).filter(User.email.ilike(email)).first()
        return _user_to_dict(u) if u else None


def get_user_by_phone(phone):
    if not phone:
        return None
    with get_session() as s:
        u = s.query(User).filter(User.phone == phone).first()
        return _user_to_dict(u) if u else None


def get_user_by_id(user_id):
    with get_session() as s:
        u = s.get(User, user_id)
        return _user_to_dict(u) if u else None


def add_user(user):
    with get_session() as s:
        u = User(
            name=user["name"], email=user.get("email"), phone=user.get("phone"),
            password_hash=user["password_hash"], preferences=user.get("preferences", []),
        )
        s.add(u)
        s.flush()  # assigns u.id without needing a separate commit
        return _user_to_dict(u)


def update_user(user_id, updates):
    with get_session() as s:
        u = s.get(User, user_id)
        if not u:
            return None
        for key, value in updates.items():
            setattr(u, key, value)
        s.flush()
        return _user_to_dict(u)


# ---- Destinations ----

def get_destinations():
    with get_session() as s:
        return [_destination_to_dict(d) for d in s.query(Destination).all()]


def get_destination_by_id(destination_id):
    with get_session() as s:
        d = s.get(Destination, destination_id)
        return _destination_to_dict(d) if d else None


# ---- Itineraries ----

def get_itineraries():
    with get_session() as s:
        return [_itinerary_to_dict(i) for i in s.query(Itinerary).all()]


def get_itineraries_for_user(user_id):
    with get_session() as s:
        rows = s.query(Itinerary).filter(Itinerary.user_id == user_id).all()
        return [_itinerary_to_dict(i) for i in rows]


def get_itinerary_by_id(itinerary_id):
    with get_session() as s:
        i = s.get(Itinerary, itinerary_id)
        return _itinerary_to_dict(i) if i else None


def add_itinerary(itinerary):
    with get_session() as s:
        i = Itinerary(
            user_id=itinerary["user_id"], destination_id=itinerary["destination_id"],
            start_date=itinerary["start_date"], end_date=itinerary["end_date"],
            time_slot=itinerary.get("time_slot", ""), transport_mode=itinerary.get("transport_mode", ""),
            notes=itinerary.get("notes", ""), shared_with=itinerary.get("shared_with", []),
            visited=itinerary.get("visited", False),
        )
        s.add(i)
        s.flush()
        return _itinerary_to_dict(i)


def update_itinerary(itinerary_id, updates):
    with get_session() as s:
        i = s.get(Itinerary, itinerary_id)
        if not i:
            return None
        for key, value in updates.items():
            if key == "review":
                if value is None:
                    i.review_rating, i.review_comment, i.review_visited_date = None, "", None
                else:
                    i.review_rating = value["rating"]
                    i.review_comment = value.get("comment", "")
                    i.review_visited_date = value["visited_date"]
            else:
                setattr(i, key, value)
        s.flush()
        return _itinerary_to_dict(i)


def get_reviews_for_destination(destination_id):
    """All reviews left on a given place, across every user, newest first."""
    with get_session() as s:
        rows = (
            s.query(Itinerary)
            .filter(Itinerary.destination_id == destination_id, Itinerary.review_rating.isnot(None))
            .order_by(Itinerary.created_at.desc())
            .all()
        )
        reviews = []
        for i in rows:
            user = s.get(User, i.user_id)
            reviews.append({
                "itinerary_id": i.id,
                "reviewer_id": i.user_id,
                "reviewer_name": user.name if user else "Former user",
                "rating": i.review_rating,
                "comment": i.review_comment,
                "visited_date": i.review_visited_date,
            })
        return reviews


# ---- Place comments ----

def get_comment_by_id(comment_id):
    with get_session() as s:
        c = s.get(Comment, comment_id)
        return _comment_to_dict(c) if c else None


def get_comments_for_place(place_id):
    with get_session() as s:
        rows = (
            s.query(Comment)
            .filter(Comment.place_id == place_id)
            .order_by(Comment.created_at.asc())
            .all()
        )
        by_id = {}
        roots = []
        reviews = {}
        for itinerary in s.query(Itinerary).filter(Itinerary.destination_id == place_id, Itinerary.review_rating.isnot(None)).order_by(Itinerary.created_at.desc()).all():
            reviews.setdefault(itinerary.user_id, {"rating": itinerary.review_rating, "comment": itinerary.review_comment, "visited_date": itinerary.review_visited_date})
        for row in rows:
            by_id[row.id] = _comment_to_dict(row)
            by_id[row.id]["review"] = reviews.get(row.user_id)
        for row in rows:
            item = by_id[row.id]
            if row.parent_comment_id is not None and row.parent_comment_id in by_id:
                by_id[row.parent_comment_id]["replies"].append(item)
            else:
                roots.append(item)
        return roots


def add_comment(place_id, user_id, parent_comment_id, message):
    with get_session() as s:
        c = Comment(
            place_id=place_id,
            user_id=user_id,
            parent_comment_id=parent_comment_id,
            message=message,
        )
        s.add(c)
        s.flush()
        return _comment_to_dict(c)


# ---- App feedback (comments/critiques about the app itself) ----

def get_feedback():
    with get_session() as s:
        rows = s.query(Feedback).order_by(Feedback.created_at.asc()).all()
        return [_feedback_to_dict(f) for f in rows]


def add_feedback(feedback):
    with get_session() as s:
        f = Feedback(
            user_id=feedback["user_id"], user_name=feedback["user_name"],
            message=feedback["message"], rating=feedback.get("rating"),
        )
        s.add(f)
        s.flush()
        return _feedback_to_dict(f)


# ---- Favorites ----

def get_favorites():
    with get_session() as s:
        return [_favorite_to_dict(f) for f in s.query(Favorite).all()]


def get_favorite_destination_ids(user_id):
    with get_session() as s:
        rows = s.query(Favorite.destination_id).filter(Favorite.user_id == user_id).all()
        return {row[0] for row in rows}


def is_favorited(user_id, destination_id):
    with get_session() as s:
        return (
            s.query(Favorite)
            .filter(Favorite.user_id == user_id, Favorite.destination_id == destination_id)
            .first()
            is not None
        )


def add_favorite(user_id, destination_id):
    with get_session() as s:
        existing = (
            s.query(Favorite)
            .filter(Favorite.user_id == user_id, Favorite.destination_id == destination_id)
            .first()
        )
        if existing:
            return _favorite_to_dict(existing), False
        f = Favorite(user_id=user_id, destination_id=destination_id)
        s.add(f)
        s.flush()
        return _favorite_to_dict(f), True


def remove_favorite(user_id, destination_id):
    with get_session() as s:
        existing = (
            s.query(Favorite)
            .filter(Favorite.user_id == user_id, Favorite.destination_id == destination_id)
            .first()
        )
        if not existing:
            return False
        s.delete(existing)
        return True


def google_user(subject, email, name, password_hash):
    with get_session() as session:
        identity = session.query(GoogleIdentity).filter(GoogleIdentity.subject == subject).first()
        if identity:
            return _user_to_dict(identity.user), False
        if session.query(User.id).filter(func.lower(User.email) == email.lower()).first():
            raise ValueError("An account with this email already exists. Sign in with your password.")
        user = User(name=name, email=email.lower(), password_hash=password_hash, preferences=[])
        session.add(user)
        session.flush()
        session.add(GoogleIdentity(user_id=user.id, subject=subject))
        session.flush()
        return _user_to_dict(user), True


def _chat_to_dict(message):
    reply = message.reply_to
    return {
        "id": message.id, "user_id": message.user_id,
        "user_name": message.user.name if message.user else "Former user",
        "message": "" if message.deleted else message.message,
        "deleted": message.deleted, "created_at": _utc_iso(message.created_at),
        "client_id": message.client_id,
        "reply_to": {
            "id": reply.id, "user_id": reply.user_id,
            "user_name": reply.user.name if reply.user else "Former user",
            "message": "" if reply.deleted else reply.message, "deleted": reply.deleted,
        } if reply else None,
    }


def get_chat_messages(before_id=None, limit=50):
    with get_session() as session:
        query = session.query(ChatMessage).options(joinedload(ChatMessage.user), joinedload(ChatMessage.reply_to).joinedload(ChatMessage.user))
        if before_id is not None:
            query = query.filter(ChatMessage.id < before_id)
        rows = query.order_by(ChatMessage.id.desc()).limit(limit + 1).all()
        return {"messages": [_chat_to_dict(message) for message in reversed(rows[:limit])], "has_more": len(rows) > limit}


def add_chat_message(user_id, message, client_id, reply_to_id=None):
    with get_session() as session:
        existing = session.query(ChatMessage).filter_by(user_id=user_id, client_id=client_id).first()
        if existing:
            return _chat_to_dict(existing), False
        if reply_to_id is not None:
            reply = session.get(ChatMessage, reply_to_id)
            if not reply or reply.deleted:
                raise ValueError("Message unavailable")
        record = ChatMessage(user_id=user_id, message=message, client_id=client_id, reply_to_id=reply_to_id)
        session.add(record)
        session.flush()
        return _chat_to_dict(record), True


def delete_chat_message(user_id, message_id):
    with get_session() as session:
        message = session.query(ChatMessage).filter_by(id=message_id, user_id=user_id).first()
        if not message:
            return None
        message.deleted = True
        message.message = ""
        session.flush()
        return _chat_to_dict(message)


def get_profile_activity(user_id):
    with get_session() as session:
        reviews = session.query(Itinerary).options(joinedload(Itinerary.destination)).filter(Itinerary.user_id == user_id, Itinerary.review_rating.isnot(None)).order_by(Itinerary.created_at.desc()).limit(50).all()
        comments = session.query(Comment).options(joinedload(Comment.destination), joinedload(Comment.user)).filter(Comment.user_id == user_id).order_by(Comment.created_at.desc()).limit(50).all()
        parent = aliased(Comment)
        replies = session.query(Comment, parent).join(parent, Comment.parent_comment_id == parent.id).filter(parent.user_id == user_id, Comment.user_id != user_id).order_by(Comment.created_at.desc()).limit(50).all()
        return {
            "reviews": [{**_itinerary_to_dict(review), "destination_name": review.destination.name} for review in reviews],
            "comments": [{**_comment_to_dict(comment), "destination_name": comment.destination.name} for comment in comments],
            "replies": [{**_comment_to_dict(reply), "destination_name": reply.destination.name, "parent_message": original.message} for reply, original in replies],
        }
