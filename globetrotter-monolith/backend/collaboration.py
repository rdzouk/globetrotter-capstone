import uuid

from flask import Blueprint, abort, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from database import get_session
from data_access import _day_trip_to_dict, _destination_to_dict, _utc_iso
from models import DayTrip, Destination, Friendship, TripExpense, TripMember, TripSuggestion, TripVote, User
from safety import blocked_user_ids


def available_trip(session, trip_id, user_id, owner_only=False):
    trip = session.get(DayTrip, trip_id)
    if trip and trip.user_id == user_id:
        return trip
    member = session.get(TripMember, (trip_id, user_id)) if trip and not owner_only else None
    if member and member.accepted and trip.user_id not in blocked_user_ids(session, user_id):
        return trip
    abort(404, description="Trip unavailable.")


def request_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="A JSON object is required.")
    return body


def trip_members(session, trip):
    rows = session.query(TripMember).filter_by(day_trip_id=trip.id).order_by(TripMember.user_id).all()
    return [{"user_id": trip.user_id, "name": trip.user.name, "status": "owner"}] + [
        {"user_id": row.user_id, "name": row.user.name, "status": "accepted" if row.accepted else "invited"} for row in rows
    ]


def expense_summary(session, trip):
    expenses = session.query(TripExpense).filter_by(day_trip_id=trip.id).order_by(TripExpense.id.desc()).all()
    participant_ids = {trip.user_id}
    for expense in expenses:
        participant_ids.update(expense.participants)
        participant_ids.add(expense.user_id)
    users = {user.id: user.name for user in session.query(User).filter(User.id.in_(participant_ids)).all()}
    balances = {user_id: {"user_id": user_id, "name": users.get(user_id, "Former user"), "paid_fcfa": 0, "share_fcfa": 0} for user_id in sorted(participant_ids)}
    for expense in expenses:
        balances[expense.user_id]["paid_fcfa"] += expense.amount_fcfa
        quotient, remainder = divmod(expense.amount_fcfa, len(expense.participants))
        for position, user_id in enumerate(sorted(expense.participants)):
            balances[user_id]["share_fcfa"] += quotient + (position < remainder)
    for balance in balances.values():
        balance["balance_fcfa"] = balance["paid_fcfa"] - balance["share_fcfa"]
    debtors = [[balance["user_id"], -balance["balance_fcfa"]] for balance in balances.values() if balance["balance_fcfa"] < 0]
    creditors = [[balance["user_id"], balance["balance_fcfa"]] for balance in balances.values() if balance["balance_fcfa"] > 0]
    settlements = []
    for debtor in debtors:
        for creditor in creditors:
            amount = min(debtor[1], creditor[1])
            if amount:
                settlements.append({"from_user_id": debtor[0], "from_name": users.get(debtor[0], "Former user"),
                                    "to_user_id": creditor[0], "to_name": users.get(creditor[0], "Former user"), "amount_fcfa": amount})
                debtor[1] -= amount
                creditor[1] -= amount
    total = sum(expense.amount_fcfa for expense in expenses)
    return {
        "expenses": [{"id": expense.id, "user_id": expense.user_id, "name": expense.user.name, "title": expense.title,
                      "category": expense.category, "amount_fcfa": expense.amount_fcfa, "participants": expense.participants,
                      "created_at": _utc_iso(expense.created_at)} for expense in expenses],
        "total_fcfa": total, "remaining_fcfa": trip.budget_fcfa - total if trip.budget_fcfa is not None else None,
        "balances": list(balances.values()), "settlements": settlements,
    }


def register_collaboration(app, require_auth, limiter):
    blueprint = Blueprint("collaboration", __name__)

    @blueprint.errorhandler(IntegrityError)
    def conflict(error):
        return jsonify({"error": "This request changed. Please refresh."}), 409

    @blueprint.get("/shared-trips")
    @require_auth
    def list_shared_trips():
        with get_session() as session:
            memberships = {row.day_trip_id: row for row in session.query(TripMember).filter_by(user_id=request.user_id).all()}
            trips = session.query(DayTrip).filter(or_(DayTrip.user_id == request.user_id, DayTrip.id.in_(memberships))).order_by(DayTrip.trip_date, DayTrip.id).all()
            result = []
            for trip in trips:
                status = "owner" if trip.user_id == request.user_id else "accepted" if memberships[trip.id].accepted else "invited"
                item = _day_trip_to_dict(trip) if status != "invited" else {"id": trip.id, "title": trip.title, "trip_date": trip.trip_date}
                result.append({**item, "status": status, "owner_name": trip.user.name})
            return jsonify(result)

    @blueprint.get("/shared-trips/<int:trip_id>")
    @require_auth
    def shared_trip(trip_id):
        with get_session() as session:
            trip = available_trip(session, trip_id, request.user_id)
            suggestions = session.query(TripSuggestion).filter_by(day_trip_id=trip_id).order_by(TripSuggestion.id).all()
            return jsonify({
                "trip": _day_trip_to_dict(trip), "viewer_id": request.user_id, "members": trip_members(session, trip),
                "budget": expense_summary(session, trip),
                "suggestions": [{"id": row.id, "user_id": row.user_id, "name": row.user.name,
                                 "destination": _destination_to_dict(row.destination), "votes": len(row.votes),
                                 "voted": any(vote.user_id == request.user_id for vote in row.votes)} for row in suggestions],
            })

    @blueprint.post("/shared-trips/<int:trip_id>/members")
    @require_auth
    @limiter.limit("30 per hour", key_func=lambda: str(request.user_id))
    def invite(trip_id):
        friend_id = request_body().get("user_id")
        if type(friend_id) is not int or friend_id == request.user_id:
            abort(400, description="Choose another traveler.")
        with get_session() as session:
            available_trip(session, trip_id, request.user_id, owner_only=True)
            if friend_id in blocked_user_ids(session, request.user_id):
                abort(400, description="Traveler unavailable.")
            lower_id, higher_id = sorted((request.user_id, friend_id))
            if not session.query(Friendship).filter_by(lower_user_id=lower_id, higher_user_id=higher_id, accepted=True).first():
                abort(400, description="Only accepted friends can be invited.")
            if session.query(TripMember).filter_by(day_trip_id=trip_id).count() >= 20:
                abort(400, description="A trip can have at most 20 guests.")
            member = session.get(TripMember, (trip_id, friend_id))
            if member:
                return jsonify({"invited": True}), 200
            session.add(TripMember(day_trip_id=trip_id, user_id=friend_id))
        return jsonify({"invited": True}), 201

    @blueprint.route("/shared-trips/<int:trip_id>/members/<int:user_id>", methods=["PATCH", "DELETE"])
    @require_auth
    def membership(trip_id, user_id):
        with get_session() as session:
            trip = session.get(DayTrip, trip_id)
            member = session.get(TripMember, (trip_id, user_id))
            if not trip or not member or request.user_id not in (trip.user_id, user_id):
                abort(404, description="Invitation unavailable.")
            if request.method == "PATCH":
                if request.user_id != user_id or request_body() != {"accepted": True}:
                    abort(400, description="Only the invited traveler can accept.")
                if trip.user_id in blocked_user_ids(session, user_id):
                    abort(404, description="Invitation unavailable.")
                member.accepted = True
            else:
                suggestions = session.query(TripSuggestion).filter_by(day_trip_id=trip_id).all()
                for suggestion in suggestions:
                    if suggestion.user_id == user_id:
                        session.delete(suggestion)
                    else:
                        for vote in suggestion.votes:
                            if vote.user_id == user_id:
                                session.delete(vote)
                session.delete(member)
        return jsonify({"updated": True})

    @blueprint.post("/shared-trips/<int:trip_id>/suggestions")
    @require_auth
    @limiter.limit("30 per hour", key_func=lambda: str(request.user_id))
    def suggest(trip_id):
        destination_id = request_body().get("destination_id")
        if type(destination_id) is not int:
            abort(400, description="Choose a valid place.")
        with get_session() as session:
            available_trip(session, trip_id, request.user_id)
            destination = session.get(Destination, destination_id)
            if not destination or (destination.publication and not destination.publication.active):
                abort(400, description="Choose a valid place.")
            existing = session.query(TripSuggestion).filter_by(day_trip_id=trip_id, destination_id=destination_id).first()
            if existing:
                return jsonify({"id": existing.id}), 200
            if session.query(TripSuggestion).filter_by(day_trip_id=trip_id).count() >= 100:
                abort(400, description="This trip has too many suggestions.")
            suggestion = TripSuggestion(day_trip_id=trip_id, user_id=request.user_id, destination_id=destination_id)
            session.add(suggestion)
            session.flush()
            result = {"id": suggestion.id}
        return jsonify(result), 201

    @blueprint.route("/shared-trips/<int:trip_id>/suggestions/<int:suggestion_id>", methods=["PUT", "DELETE"])
    @require_auth
    def suggestion_action(trip_id, suggestion_id):
        with get_session() as session:
            trip = available_trip(session, trip_id, request.user_id)
            suggestion = session.query(TripSuggestion).filter_by(id=suggestion_id, day_trip_id=trip_id).first()
            if not suggestion:
                abort(404, description="Suggestion unavailable.")
            if request.method == "DELETE":
                if request.user_id not in (trip.user_id, suggestion.user_id):
                    abort(404, description="Suggestion unavailable.")
                session.delete(suggestion)
            else:
                desired = request_body().get("vote")
                if type(desired) is not bool:
                    abort(400, description="Choose a valid vote.")
                vote = session.get(TripVote, (suggestion_id, request.user_id))
                if desired and not vote:
                    session.add(TripVote(suggestion_id=suggestion_id, user_id=request.user_id))
                elif not desired and vote:
                    session.delete(vote)
        return jsonify({"updated": True})

    @blueprint.post("/shared-trips/<int:trip_id>/expenses")
    @require_auth
    @limiter.limit("60 per hour", key_func=lambda: str(request.user_id))
    def add_expense(trip_id):
        body = request_body()
        try:
            client_id = str(uuid.UUID(body.get("client_id", "")))
        except (ValueError, TypeError, AttributeError):
            abort(400, description="Invalid expense identifier.")
        amount = body.get("amount_fcfa")
        title = body.get("title")
        category = body.get("category")
        participants = body.get("participants")
        if type(amount) is not int or not 1 <= amount <= 10000000:
            abort(400, description="Use a whole FCFA amount between 1 and 10000000.")
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 120:
            abort(400, description="Use an expense title between 1 and 120 characters.")
        if category not in ("transport", "food", "entry", "stay", "other"):
            abort(400, description="Choose an expense category.")
        if not isinstance(participants, list) or not 1 <= len(participants) <= 21 or any(type(user_id) is not int for user_id in participants) or len(set(participants)) != len(participants):
            abort(400, description="Choose the travelers sharing this expense.")
        with get_session() as session:
            trip = available_trip(session, trip_id, request.user_id)
            existing = session.query(TripExpense).filter_by(day_trip_id=trip_id, user_id=request.user_id, client_id=client_id).first()
            if existing:
                return jsonify({"id": existing.id}), 200
            accepted_ids = {member["user_id"] for member in trip_members(session, trip) if member["status"] != "invited"}
            if not set(participants).issubset(accepted_ids):
                abort(400, description="Only trip members can share expenses.")
            if session.query(TripExpense).filter_by(day_trip_id=trip_id).count() >= 500:
                abort(400, description="This trip has too many expenses.")
            expense = TripExpense(day_trip_id=trip_id, user_id=request.user_id, client_id=client_id,
                                  title=title.strip(), category=category, amount_fcfa=amount, participants=sorted(participants))
            session.add(expense)
            session.flush()
            result = {"id": expense.id}
        return jsonify(result), 201

    @blueprint.delete("/shared-trips/<int:trip_id>/expenses/<int:expense_id>")
    @require_auth
    def remove_expense(trip_id, expense_id):
        with get_session() as session:
            trip = available_trip(session, trip_id, request.user_id)
            expense = session.query(TripExpense).filter_by(id=expense_id, day_trip_id=trip_id).first()
            if not expense or request.user_id not in (trip.user_id, expense.user_id):
                abort(404, description="Expense unavailable.")
            session.delete(expense)
        return jsonify({"removed": True})

    app.register_blueprint(blueprint)