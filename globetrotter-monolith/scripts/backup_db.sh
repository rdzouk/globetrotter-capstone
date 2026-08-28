#!/usr/bin/env bash
# Daily Postgres backup, kept OFF the production VPS.
# Run via cron, e.g.: 0 3 * * * /opt/globetrotter/scripts/backup_db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
source .env

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/opt/globetrotter-backups}"
BACKUP_FILE="$BACKUP_DIR/globetrotter-$TIMESTAMP.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

echo "Backing up to $BACKUP_FILE ..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

# Verify the backup isn't empty/corrupt before trusting it.
if ! gzip -t "$BACKUP_FILE"; then
  echo "ERROR: backup file failed integrity check, deleting it" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi
echo "Backup verified OK ($(du -h "$BACKUP_FILE" | cut -f1))"

# Retention: delete local copies older than RETENTION_DAYS.
find "$BACKUP_DIR" -name "globetrotter-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

# IMPORTANT: $BACKUP_DIR must itself be synced off this VPS (rsync to
# another host, or `aws s3 sync`/`rclone sync` to object storage) —
# a backup that lives on the same machine as the database it backs up
# doesn't survive that machine failing. Add your sync command here, e.g.:
#   rclone sync "$BACKUP_DIR" remote:globetrotter-backups
