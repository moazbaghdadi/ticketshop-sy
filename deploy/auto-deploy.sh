#!/usr/bin/env bash
# Cron-driven auto-deploy. Polls origin/master, rebuilds + restarts on new commits.
# Wire into root's crontab on the LXC:
#   */5 * * * * /root/apps/ticketshop/deploy/auto-deploy.sh >> /var/log/ticketshop-auto-deploy.log 2>&1
#
# Idempotent and concurrency-safe: flock prevents overlapping runs if a build
# takes longer than the cron interval. --ff-only prevents accidental merges if
# local state has diverged.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK=/tmp/ticketshop-auto-deploy.lock
exec 200>"$LOCK"
flock -n 200 || { echo "[$(date -Iseconds)] another deploy in progress, skipping"; exit 0; }

cd "$REPO_ROOT"

git fetch --quiet origin master
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date -Iseconds)] new commits ${LOCAL:0:7} -> ${REMOTE:0:7}, deploying"
git pull --ff-only --quiet origin master

cd deploy
docker compose build
docker compose up -d
docker image prune -f >/dev/null

echo "[$(date -Iseconds)] deploy complete at $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
