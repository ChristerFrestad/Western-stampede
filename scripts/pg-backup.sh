#!/usr/bin/env bash
# Postgres logical backup for Western Stampede durable profile.
#
# Usage (host with docker):
#   ./scripts/pg-backup.sh
#   CONTAINER=ws-postgres ./scripts/pg-backup.sh
#   DATABASE_URL=postgres://ws:ws@127.0.0.1:15432/western_stampede ./scripts/pg-backup.sh
#
# Writes: backups/ws-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/ws-$STAMP.sql.gz"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[pg-backup] pg_dump via DATABASE_URL → $OUT_FILE"
  # strip query params for pg_dump if any
  pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -c > "$OUT_FILE"
else
  CONTAINER="${CONTAINER:-}"
  if [[ -z "$CONTAINER" ]]; then
    # try common compose names
    for c in western-stampede-postgres-1 ws-postgres postgres; do
      if docker ps --format '{{.Names}}' | grep -qx "$c"; then
        CONTAINER="$c"
        break
      fi
    done
  fi
  if [[ -z "${CONTAINER:-}" ]]; then
    # fuzzy
    CONTAINER="$(docker ps --format '{{.Names}}' | grep -i postgres | head -n1 || true)"
  fi
  if [[ -z "${CONTAINER:-}" ]]; then
    echo "No postgres container found. Set CONTAINER=... or DATABASE_URL=..." >&2
    exit 1
  fi
  USER_DB="${POSTGRES_USER:-ws}"
  DB="${POSTGRES_DB:-western_stampede}"
  echo "[pg-backup] docker exec $CONTAINER pg_dump -U $USER_DB $DB → $OUT_FILE"
  docker exec "$CONTAINER" pg_dump -U "$USER_DB" "$DB" --no-owner --no-acl | gzip -c > "$OUT_FILE"
fi

BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "[pg-backup] ok bytes=$BYTES path=$OUT_FILE"
# keep last N backups
KEEP="${BACKUP_KEEP:-14}"
ls -1t "$OUT_DIR"/ws-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "[pg-backup] retained up to $KEEP files in $OUT_DIR"
