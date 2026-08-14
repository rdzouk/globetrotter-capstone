# BACKUPS.md

## What's backed up

The PostgreSQL database only — it's the single source of truth for
users, destinations, itineraries, favorites, and feedback. The
frontend and backend code themselves are backed up implicitly by
being in git.

## Schedule

Daily, via cron:
```bash
crontab -e
# add:
0 3 * * * /opt/globetrotter/scripts/backup_db.sh >> /var/log/globetrotter-backup.log 2>&1
```

## Retention

14 days locally (configurable via `RETENTION_DAYS` env var), enforced
by `backup_db.sh` itself. Off-VPS retention depends on wherever you
sync backups to (see below) — set a lifecycle policy there too if
using object storage.

## Off-VPS storage (required)

`scripts/backup_db.sh` writes to `/opt/globetrotter-backups` on the
VPS itself by default — **that alone is not a real backup strategy**,
since it doesn't survive the VPS being lost. Add a sync step at the
bottom of the script to ship backups elsewhere: `rclone sync` to
S3/R2/Backblaze, or `rsync` to a second machine, run right after the
local backup completes.

## Verification

`backup_db.sh` gzip-tests every backup immediately after creating it
and deletes it if the integrity check fails, rather than silently
keeping a corrupt file.

## Restore procedure

```bash
./scripts/restore_db.sh /opt/globetrotter-backups/globetrotter-20260101-030000.sql.gz
```
Requires typing `yes` to confirm — this replaces all current data.
Test this procedure periodically against a non-production
database/environment, not just when you actually need it in an
emergency.
