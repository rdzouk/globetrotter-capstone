def validate_registration_payload(payload):
    errors = []
    if not payload.get("name"):
        errors.append("name is required")
    if not payload.get("password"):
        errors.append("password is required")
    elif len(payload["password"]) < 4:
        errors.append("password must be at least 4 characters")

    email = payload.get("email")
    phone = payload.get("phone")
    if not email and not phone:
        errors.append("either email or phone is required")
    if email and "@" not in email:
        errors.append("email looks invalid")
    if phone and not any(ch.isdigit() for ch in phone):
        errors.append("phone looks invalid")

    preferences = payload.get("preferences", [])
    if not isinstance(preferences, list):
        errors.append("preferences must be a list of tags")

    return errors


def validate_profile_update(payload):
    errors = []
    if "name" in payload and not payload["name"].strip():
        errors.append("name cannot be empty")
    if "preferences" in payload and not isinstance(payload["preferences"], list):
        errors.append("preferences must be a list of tags")
    return errors


def validate_feedback_payload(payload):
    errors = []
    message = payload.get("message")
    if not message or not message.strip():
        errors.append("message is required")
    elif len(message) > 2000:
        errors.append("message is too long (max 2000 characters)")

    rating = payload.get("rating")
    if rating is not None and (not isinstance(rating, (int, float)) or not (1 <= rating <= 5)):
        errors.append("rating, if provided, must be a number between 1 and 5")

    return errors
