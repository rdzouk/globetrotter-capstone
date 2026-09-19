from io import BytesIO
import json
import math
import uuid

from flask import Blueprint, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

from administration import CATEGORIES
import data_access as db
from media import prepare_photo


def validate_contribution(details):
    allowed = {"name", "category", "neighborhood", "address", "description", "lat", "lng", "phone", "price_level", "tags"}
    if not isinstance(details, dict) or set(details) - allowed:
        raise ValueError("Complete the required place details.")
    for field, maximum in {"name": 200, "neighborhood": 100, "address": 300, "description": 6000}.items():
        value = details.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise ValueError("Complete the required place details.")
    if not isinstance(details.get("category"), str) or details["category"] not in CATEGORIES:
        raise ValueError("Choose a valid category.")
    for field, maximum in (("lat", 90), ("lng", 180)):
        value = details.get(field)
        if type(value) not in (int, float) or not math.isfinite(value) or not -maximum <= value <= maximum:
            raise ValueError("Enter valid latitude and longitude coordinates.")
    price_level = details.get("price_level")
    if price_level is not None and (type(price_level) is not int or not 1 <= price_level <= 4):
        raise ValueError("Choose a valid price level.")
    phone = details.get("phone")
    if phone is not None and (not isinstance(phone, str) or len(phone) > 32):
        raise ValueError("Enter a valid place phone number.")
    tags = details.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 20 or any(not isinstance(tag, str) or not tag.strip() or len(tag) > 40 for tag in tags):
        raise ValueError("Use at most 20 short tags.")
    return {**{field: details[field].strip() for field in ("name", "category", "neighborhood", "address", "description")}, "lat": details["lat"], "lng": details["lng"], "price_level": price_level, "phone": phone.strip() if phone else None, "tags": [tag.strip() for tag in tags]}


def register_contributions(app, require_auth, limiter):
    blueprint = Blueprint("contributions", __name__)

    @blueprint.post("/destinations")
    @require_auth
    @limiter.limit("5 per hour;15 per day", key_func=lambda: str(request.user_id))
    def create_place():
        try:
            client_id = str(uuid.UUID(request.form.get("client_id", "")))
            details = validate_contribution(json.loads(request.form.get("details", "")))
            image = prepare_photo(request.files.get("photo"))
            place, created = db.add_community_destination(request.user_id, client_id, details, image)
            return jsonify(place), 201 if created else 200
        except (json.JSONDecodeError, AttributeError):
            return jsonify({"error": "Complete the required place details."}), 400
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        except IntegrityError:
            return jsonify({"error": "This submission changed. Please retry."}), 409

    @blueprint.get("/destinations/<int:destination_id>/photos")
    @require_auth
    def photos(destination_id):
        try:
            before = int(request.args["before_id"]) if "before_id" in request.args else None
            if before is not None and before <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid photo pagination."}), 400
        result = db.get_destination_photos(destination_id, before)
        if result is None:
            return jsonify({"error": "destination not found"}), 404
        return jsonify(result)

    @blueprint.post("/destinations/<int:destination_id>/photos")
    @require_auth
    @limiter.limit("20 per hour;100 per day", key_func=lambda: str(request.user_id))
    def upload_photo(destination_id):
        try:
            client_id = str(uuid.UUID(request.form.get("client_id", "")))
            caption = request.form.get("caption", "").strip()
            if len(caption) > 300:
                return jsonify({"error": "Captions must be 300 characters or fewer."}), 400
            image = prepare_photo(request.files.get("photo"))
            photo, created = db.add_destination_photo(request.user_id, destination_id, client_id, caption, image)
            return jsonify(photo), 201 if created else 200
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        except IntegrityError:
            return jsonify({"error": "This submission changed. Please retry."}), 409

    @blueprint.get("/destinations/<int:destination_id>/photos/<int:photo_id>/image")
    @require_auth
    def photo_image(destination_id, photo_id):
        image = db.get_destination_photo_image(destination_id, photo_id)
        if image is None:
            return jsonify({"error": "Photo unavailable."}), 404
        return send_file(BytesIO(image), mimetype="image/jpeg", download_name="place.jpg", max_age=0)

    @blueprint.delete("/destinations/<int:destination_id>/photos/<int:photo_id>")
    @require_auth
    def delete_photo(destination_id, photo_id):
        if not db.delete_destination_photo(request.user_id, destination_id, photo_id, request.user_role == "admin"):
            return jsonify({"error": "Photo unavailable."}), 404
        return jsonify({"removed": True})

    app.register_blueprint(blueprint)