"""
Scans frontend/static/images/places/ for files named <id>.jpg / <id>.jpeg /
<id>.png (where <id> matches a destination's "id" in data.json) and points
that destination's image_url at the local file instead of the LoremFlickr
placeholder.

Run this any time after adding new photos:
    cd backend
    python update_images.py

Places with no matching file keep whatever image_url they already have
(the placeholder), so you can add photos gradually — no need to do all 58
at once.
"""
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(SCRIPT_DIR, "data.json")
IMAGES_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "static", "images", "places")

VALID_EXTENSIONS = [".jpg", ".jpeg", ".png"]


def find_local_image(destination_id):
    for ext in VALID_EXTENSIONS:
        candidate = os.path.join(IMAGES_DIR, f"{destination_id}{ext}")
        if os.path.isfile(candidate):
            return f"/static/images/places/{destination_id}{ext}"
    return None


def main():
    if not os.path.isdir(IMAGES_DIR):
        print(f"Creating {IMAGES_DIR} — drop your photos in there, then re-run this.")
        os.makedirs(IMAGES_DIR, exist_ok=True)
        return

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    still_placeholder = []
    for place in data["destinations"]:
        local_path = find_local_image(place["id"])
        if local_path:
            place["image_url"] = local_path
            updated += 1
        else:
            still_placeholder.append(f"{place['id']}: {place['name']}")

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Updated {updated} place(s) with local photos.")
    if still_placeholder:
        print(f"\n{len(still_placeholder)} place(s) still using the placeholder image:")
        for line in still_placeholder:
            print(f"  {line}")


if __name__ == "__main__":
    main()
