#!/usr/bin/env bash
# Nightly Postgres dump. Wire into host crontab:
#   0 3 * * * /opt/ticketshop/deploy/backup.sh >> /var/log/ticketshop-backup.log 2>&1

set -euo pipefail

cd "$(dirname "$0")"
set -a; source .env; set +a

mkdir -p backups
STAMP=$(date +%F)
docker exec ticketshop-postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 \
  > "backups/${STAMP}.dump"

# Keep 14 days locally
find backups -name '*.dump' -mtime +14 -delete

# Optional: ship off-box. Uncomment after `rclone config` sets up a remote.
# rclone copy "backups/${STAMP}.dump" b2:ticketshop-backups/

echo "[$(date -Iseconds)] backup complete: ${STAMP}.dump"
