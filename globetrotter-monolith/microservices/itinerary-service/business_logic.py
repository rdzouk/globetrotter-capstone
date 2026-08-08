def validate_itinerary_payload(payload):
    """
    Note: this only validates the SHAPE of the payload (dates, presence
    of destination_id). Whether that destination_id actually exists is
    checked separately in app.py via a cross-service call to
    Recommendation Service — this layer has no access to that data.
    """
    errors = []
    if "destination_id" not in payload:
        errors.append("destination_id is required")

    if "start_date" not in payload:
        errors.append("start_date is required (YYYY-MM-DD)")
    if "end_date" not in payload:
        errors.append("end_date is required (YYYY-MM-DD)")
    if "start_date" in payload and "end_date" in payload:
        if payload["end_date"] < payload["start_date"]:
            errors.append("end_date cannot be before start_date")

    return errors


def validate_review_payload(payload):
    errors = []
    rating = payload.get("rating")
    if rating is None:
        errors.append("rating is required")
    elif not isinstance(rating, (int, float)) or not (1 <= rating <= 5):
        errors.append("rating must be a number between 1 and 5")

    if "visited_date" not in payload:
        errors.append("visited_date is required (YYYY-MM-DD)")

    comment = payload.get("comment", "")
    if comment and len(comment) > 1000:
        errors.append("comment is too long (max 1000 characters)")

    return errors
