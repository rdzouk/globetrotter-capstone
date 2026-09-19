from io import BytesIO
import uuid

from flask import Blueprint, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

import data_access as db
from media import prepare_audio


def register_social(app, require_auth, limiter):
    blueprint = Blueprint("social", __name__)

    @blueprint.get("/friends")
    @require_auth
    def friends():
        return jsonify(db.get_friendships(request.user_id))

    @blueprint.post("/friends")
    @require_auth
    @limiter.limit("30 per hour", key_func=lambda: str(request.user_id))
    def add_friend():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "Choose another traveler."}), 400
        try:
            friendship, created = db.request_friendship(request.user_id, body.get("user_id"))
            return jsonify(friendship), 201 if created else 200
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        except IntegrityError:
            return jsonify({"error": "This request changed. Please refresh."}), 409

    @blueprint.route("/friends/<int:friendship_id>", methods=["PATCH", "DELETE"])
    @require_auth
    def update_friend(friendship_id):
        if request.method == "DELETE":
            if not db.remove_friendship(request.user_id, friendship_id):
                return jsonify({"error": "Friend request unavailable."}), 404
            return jsonify({"removed": True})
        if request.get_json(silent=True) != {"action": "accept"}:
            return jsonify({"error": "Choose a valid friend action."}), 400
        friendship = db.accept_friendship(request.user_id, friendship_id)
        if not friendship:
            return jsonify({"error": "Friend request unavailable."}), 404
        return jsonify(friendship)

    @blueprint.get("/friends/<int:friendship_id>/messages")
    @require_auth
    def messages(friendship_id):
        try:
            before = int(request.args["before_id"]) if "before_id" in request.args else None
            limit = int(request.args.get("limit", "50"))
            if (before is not None and before < 1) or not 1 <= limit <= 100:
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid message pagination."}), 400
        result = db.get_direct_messages(request.user_id, friendship_id, before, limit)
        if result is None:
            return jsonify({"error": "Conversation unavailable."}), 404
        return jsonify(result)

    @blueprint.post("/friends/<int:friendship_id>/messages")
    @require_auth
    @limiter.limit("20 per minute;200 per day", key_func=lambda: str(request.user_id))
    def send_message(friendship_id):
        if db.get_direct_messages(request.user_id, friendship_id, limit=1) is None:
            return jsonify({"error": "Conversation unavailable."}), 404
        multipart = request.mimetype == "multipart/form-data"
        body = request.form if multipart else request.get_json(silent=True)
        if not hasattr(body, "get"):
            return jsonify({"error": "message is required"}), 400
        try:
            client_id = str(uuid.UUID(body.get("client_id", "")))
        except (ValueError, TypeError, AttributeError):
            return jsonify({"error": "Invalid message identifier."}), 400
        text = body.get("message", "")
        if not isinstance(text, str) or len(text.strip()) > 2000 or (not multipart and not text.strip()):
            return jsonify({"error": "Use a message between 1 and 2000 characters."}), 400
        try:
            audio = prepare_audio(request.files.get("audio")) if multipart else None
            message, created = db.add_direct_message(request.user_id, friendship_id, client_id, text.strip(), audio)
            return jsonify(message), 201 if created else 200
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        except IntegrityError:
            return jsonify({"error": "Message could not be saved. Please retry."}), 409

    @blueprint.get("/friends/<int:friendship_id>/messages/<int:message_id>/audio")
    @require_auth
    def audio(friendship_id, message_id):
        result = db.get_direct_audio(request.user_id, friendship_id, message_id)
        if not result:
            return jsonify({"error": "Voice note unavailable."}), 404
        content, media_type = result
        return send_file(BytesIO(content), mimetype=media_type, download_name="voice-note", max_age=0)

    @blueprint.delete("/friends/<int:friendship_id>/messages/<int:message_id>")
    @require_auth
    def remove_message(friendship_id, message_id):
        message = db.delete_direct_message(request.user_id, friendship_id, message_id)
        if not message:
            return jsonify({"error": "Message unavailable"}), 404
        return jsonify(message)

    app.register_blueprint(blueprint)