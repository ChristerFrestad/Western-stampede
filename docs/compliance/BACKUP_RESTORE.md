# Postgres backup & restore — Western Stampede

Applies to **durable** / **prod-like** profiles (`DATABASE_URL` set).  
Memory store needs no DB backup (data is ephemeral).

## What to back up

| Object | How |
| --- | --- |
| Application DB | `pg_dump` (logical) via `scripts/pg-backup.sh` |
| Secrets | Outside DB: `JWT_SECRET`, `ADMIN_TOKEN`, operator API keys |
| Lab drops | `lab-output/` + `LAB_SIGNING_KEY` (HMAC) |

Schema is applied on RGS boot (`PostgresStore.connect`); restore of data dump is sufficient if dump includes schema.

## Backup (recommended)

```bash
# Docker Compose durable stack on host
chmod +x scripts/pg-backup.sh scripts/pg-restore.sh
./scripts/pg-backup.sh

# Explicit container
CONTAINER=western-stampede-postgres-1 ./scripts/pg-backup.sh

# Host-installed client
DATABASE_URL=postgres://ws:ws@127.0.0.1:15432/western_stampede ./scripts/pg-backup.sh
```

Output: `backups/ws-YYYYMMDD-HHMMSS.sql.gz`  
Retention: last `BACKUP_KEEP` files (default **14**).

### Cron example (host)

```cron
15 3 * * * cd /opt/western-stampede && CONTAINER=... ./scripts/pg-backup.sh >> /var/log/ws-pg-backup.log 2>&1
```

### Portainer / one-shot

**Stacks → console** on postgres container:

```bash
pg_dump -U ws western_stampede --no-owner --no-acl | gzip -c > /tmp/ws-backup.sql.gz
# then docker cp from host
```

## Restore

**Staging / disaster recovery only.** Overwrites live data.

```bash
RESTORE_DANGEROUS=1 ./scripts/pg-restore.sh backups/ws-20260805-120000.sql.gz
```

Then:

1. Restart RGS containers  
2. `RGS_URL=... ADMIN_TOKEN=... pnpm deploy:preflight`  
3. Spot-check: guest auth, spin, `/api/v1/admin/metrics`

### Partial recovery

Prefer restore to a **new** database name, point a shadow RGS at it, export specific tables if needed. Avoid production restore without dry-run.

## Verification after backup

```bash
# non-empty archive
gzip -t backups/ws-*.sql.gz
# list tables in latest
gunzip -c "$(ls -1t backups/ws-*.sql.gz | head -1)" | grep -E '^CREATE TABLE' | head
```

## RPO / RTO (engineering targets)

| Mode | RPO | RTO | Notes |
| --- | --- | --- | --- |
| Demo memory | n/a | restart | no durability |
| Nightly dump | ≤ 24h | minutes–hours | default script |
| Continuous | WAL archiving | minutes | not automated here — use managed Postgres |

## Related

- [RUNBOOK_OPS.md](./RUNBOOK_OPS.md)  
- [deploy/portainer.md](../../deploy/portainer.md)  
