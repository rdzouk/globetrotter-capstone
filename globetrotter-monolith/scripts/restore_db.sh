#!/usr/bin/env bash
# Restores a Postgres backup created by backup_db.sh.
# Usage: ./restore_db.sh /path/to/globetrotter-20260101-030000.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."
source .env

BACKUP_FILE="${1:?Usage: restore_db.sh <path-to-backup.sql.gz>}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "This will REPLACE all data in the '$POSTGRES_DB' database with the contents of:"
echo "  $BACKUP_FILE"
read -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring..."
gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restore complete. Verify with:"
echo "  curl http://localhost/health"
echo "  curl http://localhost/api/destinations | head -c 200"
