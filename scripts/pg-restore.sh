#!/usr/bin/env bash
# Restore a gzipped pg_dump into Western Stampede Postgres.
#
# Usage:
#   ./scripts/pg-restore.sh backups/ws-20260805-120000.sql.gz
#   CONTAINER=... ./scripts/pg-restore.sh path.sql.gz
#
# WARNING: drops public schema objects by default (DEV/STAGING).
# Set RESTORE_DANGEROUS=1 to proceed.
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

if [[ "${RESTORE_DANGEROUS:-}" != "1" ]]; then
  echo "Refusing restore without RESTORE_DANGEROUS=1 (destroys current DB data)." >&2
  exit 2
fi

USER_DB="${POSTGRES_USER:-ws}"
DB="${POSTGRES_DB:-western_stampede}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[pg-restore] restore via DATABASE_URL from $FILE"
  gunzip -c "$FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
else
  CONTAINER="${CONTAINER:-}"
  if [[ -z "$CONTAINER" ]]; then
    CONTAINER="$(docker ps --format '{{.Names}}' | grep -i postgres | head -n1 || true)"
  fi
  if [[ -z "${CONTAINER:-}" ]]; then
    echo "No postgres container. Set CONTAINER= or DATABASE_URL=" >&2
    exit 1
  fi
  echo "[pg-restore] docker exec $CONTAINER from $FILE"
  gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$USER_DB" -d "$DB" -v ON_ERROR_STOP=1
fi

echo "[pg-restore] done — restart RGS and run: pnpm deploy:preflight"
