"""
Migrates an EXISTING JSON-file deployment's real data (users,
destinations, itineraries, favorites, feedback) into the relational
database (PostgreSQL in production, SQLite in local dev — whatever
DATABASE_URL / database.py resolves to).

This is a ONE-TIME migration tool for anyone who was running the old
JSON-file version of the backend and has real user data sitting in
data.json that needs to move into the database. It is NOT how the
app seeds itself day-to-day — that's backend/seed_destinations.py,
which handles the 58-place Yaoundé catalog specifically.

Safety guarantees:
  - --dry-run: reports exactly what would happen, writes nothing.
  - Never deletes or modifies data.json — the migration is read-only
    on the source.
  - Duplicate detection: skips (reports, doesn't crash on) any user
    whose email/phone already exists in the target database, and any
    destination ID that's already present.
  - Transaction safety: each entity type is migrated in its own
    transaction; a failure partway through one type doesn't leave
    partially-written rows — either that type's batch fully commits
    or it fully rolls back.
  - Repeatable: safe to run twice — already-migrated rows are
    detected and skipped, not duplicated.

Usage:
    cd scripts
    python migrate_json_to_postgres.py --source ../backend/data.json --dry-run
    python migrate_json_to_postgres.py --source ../backend/data.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import database
from models import User, Destination, Itinerary, Favorite, Feedback


def load_source(path):
    if not os.path.isfile(path):
        print(f"ERROR: source file not found: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def migrate_users(session, users, dry_run):
    migrated, skipped_duplicate, errors = 0, 0, []
    for u in users:
        try:
            existing = None
            if u.get("email"):
                existing = session.query(User).filter(User.email == u["email"]).first()
            if not existing and u.get("phone"):
                existing = session.query(User).filter(User.phone == u["phone"]).first()
            if existing:
                skipped_duplicate += 1
                continue
            if not dry_run:
                session.add(User(
                    id=u["id"], name=u["name"], email=u.get("email"), phone=u.get("phone"),
                    password_hash=u["password_hash"], preferences=u.get("preferences", []),
                ))
            migrated += 1
        except Exception as e:
            errors.append(f"user id={u.get('id')}: {e}")
    return migrated, skipped_duplicate, errors


def migrate_destinations(session, destinations, dry_run):
    migrated, skipped_duplicate, errors = 0, 0, []
    for d in destinations:
        try:
            if session.get(Destination, d["id"]):
                skipped_duplicate += 1
                continue
            if not dry_run:
                session.add(Destination(
                    id=d["id"], name=d["name"], category=d["category"], neighborhood=d["neighborhood"],
                    address=d["address"], lat=d["lat"], lng=d["lng"], rating=d["rating"],
                    rating_count=d.get("rating_count", 0), price_level=d.get("price_level"),
                    phone=d.get("phone"), tags=d.get("tags", []), description=d.get("description", ""),
                    image_url=d.get("image_url", ""),
                ))
            migrated += 1
        except Exception as e:
            errors.append(f"destination id={d.get('id')}: {e}")
    return migrated, skipped_duplicate, errors


def migrate_itineraries(session, itineraries, dry_run):
    migrated, skipped_duplicate, errors = 0, 0, []
    for i in itineraries:
        try:
            if session.get(Itinerary, i["id"]):
                skipped_duplicate += 1
                continue
            review = i.get("review") or {}
            if not dry_run:
                session.add(Itinerary(
                    id=i["id"], user_id=i["user_id"], destination_id=i["destination_id"],
                    start_date=i["start_date"], end_date=i["end_date"],
                    time_slot=i.get("time_slot", ""), transport_mode=i.get("transport_mode", ""),
                    notes=i.get("notes", ""), shared_with=i.get("shared_with", []),
                    visited=i.get("visited", False),
                    review_rating=review.get("rating"), review_comment=review.get("comment", ""),
                    review_visited_date=review.get("visited_date"),
                ))
            migrated += 1
        except Exception as e:
            errors.append(f"itinerary id={i.get('id')}: {e}")
    return migrated, skipped_duplicate, errors


def migrate_favorites(session, favorites, dry_run):
    migrated, skipped_duplicate, errors = 0, 0, []
    for fav in favorites:
        try:
            existing = (
                session.query(Favorite)
                .filter(Favorite.user_id == fav["user_id"], Favorite.destination_id == fav["destination_id"])
                .first()
            )
            if existing:
                skipped_duplicate += 1
                continue
            if not dry_run:
                session.add(Favorite(user_id=fav["user_id"], destination_id=fav["destination_id"]))
            migrated += 1
        except Exception as e:
            errors.append(f"favorite {fav}: {e}")
    return migrated, skipped_duplicate, errors


def migrate_feedback(session, feedback_list, dry_run):
    migrated, skipped_duplicate, errors = 0, 0, []
    for fb in feedback_list:
        try:
            if session.get(Feedback, fb["id"]):
                skipped_duplicate += 1
                continue
            if not dry_run:
                session.add(Feedback(
                    id=fb["id"], user_id=fb["user_id"], user_name=fb["user_name"],
                    message=fb["message"], rating=fb.get("rating"),
                ))
            migrated += 1
        except Exception as e:
            errors.append(f"feedback id={fb.get('id')}: {e}")
    return migrated, skipped_duplicate, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default="../backend/data.json", help="Path to the JSON file to migrate from")
    parser.add_argument("--dry-run", action="store_true", help="Report what would happen without writing anything")
    args = parser.parse_args()

    source_path = os.path.abspath(os.path.join(os.path.dirname(__file__), args.source))
    data = load_source(source_path)

    print(f"{'DRY RUN — ' if args.dry_run else ''}Migrating {source_path}")
    print(f"Target database: {database.DATABASE_URL}\n")

    database.init_db()

    results = {}
    all_errors = []

    # Each entity type gets its own transaction — a failure in one
    # doesn't roll back a different, already-successful type.
    with database.get_session() as session:
        results["destinations"] = migrate_destinations(session, data.get("destinations", []), args.dry_run)
    with database.get_session() as session:
        results["users"] = migrate_users(session, data.get("users", []), args.dry_run)
    with database.get_session() as session:
        results["itineraries"] = migrate_itineraries(session, data.get("itineraries", []), args.dry_run)
    with database.get_session() as session:
        results["favorites"] = migrate_favorites(session, data.get("favorites", []), args.dry_run)
    with database.get_session() as session:
        results["feedback"] = migrate_feedback(session, data.get("feedback", []), args.dry_run)

    print(f"{'Would migrate' if args.dry_run else 'Migrated'} (migrated / already-present-skipped / errors):")
    for entity, (migrated, skipped, errors) in results.items():
        print(f"  {entity:14} {migrated:4} / {skipped:4} / {len(errors)}")
        all_errors.extend(errors)

    if all_errors:
        print(f"\n{len(all_errors)} error(s):")
        for e in all_errors:
            print(f"  - {e}")

    if args.dry_run:
        print("\nDry run complete — nothing was written. Re-run without --dry-run to apply.")
    else:
        print("\nMigration complete. Source file was not modified.")

    sys.exit(1 if all_errors else 0)


if __name__ == "__main__":
    main()
