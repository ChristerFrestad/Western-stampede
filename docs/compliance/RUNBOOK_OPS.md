# Operations runbook — Western Stampede RGS

## Health

| Endpoint | Expectation |
| --- | --- |
| `GET /health` | `ok: true`, RNG status not `failed`; includes `store`, `rateLimit` |
| `GET /ready` | HTTP 200; 503 if RNG fail-closed or store down |
| `GET /version` | Public pins: `mathVersion`, `protocolVersion`, `demoOnly` |
| `GET /openapi.json` | Protocol document |
| `GET /api/v1/admin/ops` | Super-admin ops snapshot (`x-admin-token`); 503 if not ready |
| `GET /api/v1/admin/metrics` | Wagered/won, telemetry, wallet (role-scoped) |
| `GET /api/v1/admin/telemetry/export` | OTLP sample + span ring |

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port (default 3000) |
| `RNG_PROVIDER` | `local` / `production-csprng` / `external` (must be wired) |
| `REAL_MONEY` | Enables production money gates |
| `COMPLIANCE_MODE` | Forbids live math mutation |
| `DATABASE_URL` | Postgres connection (schema migrate on boot) |
| `REQUIRE_DURABLE_STORE` | Exit if no DATABASE_URL |
| `REDIS_URL` | Multi-node rate limit (`ioredis`); memory fallback |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP JSON traces (e.g. `http://collector:4318`) |
| `OTEL_SERVICE_NAME` | Span resource service.name |
| `ADMIN_TOKEN` | Admin API (`x-admin-token`) |
| `JWT_SECRET` | Session material (rotate in prod) |
| `CORS_ORIGIN` | Allowed origins |
| `LAB_SIGNING_KEY` | HMAC for lab drop MANIFEST (pack:v2) |

## Preflight

```bash
# Against running RGS
RGS_URL=http://127.0.0.1:3000 ADMIN_TOKEN=... pnpm deploy:preflight

# Static only (no live probes)
PREFLIGHT_LIVE=false pnpm deploy:preflight

# Fail on default secrets
PREFLIGHT_STRICT=true JWT_SECRET=... ADMIN_TOKEN=... pnpm deploy:preflight
```

Portainer step-by-step: [deploy/portainer.md](../../deploy/portainer.md)  
Postgres backup/restore: [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)  
Secret rotation: [SECRET_ROTATION.md](../security/SECRET_ROTATION.md)  
Ops UI: `http://host:18080/admin.html` or `http://host:13000/admin` (enter `x-admin-token`)  
Operator onboard: `pnpm operator:onboard -- --code acme --name "Acme" --smoke`

## Incident: RNG fail-closed

1. Check `/health` → `rng.failClosed` and `/api/v1/admin/ops`.  
2. Inspect host entropy / container seccomp.  
3. Restart process only after root cause; do **not** switch to sim RNG.  
4. Audit chain tip via admin metrics (`auditOk`, `auditTip`).

## Incident: money discrepancy

1. Fetch round by id (`/api/v1/rounds/:id`) — compare `debit`, `totalWin`, `rngMeta.drawIds`.  
2. Check ledger refs `spin-debit:{roundId}` / `spin-win:{roundId}`.  
3. Verify audit event `round.completed` hash chain (`auditOk`).

## Incident: rate limit / multi-node inconsistency

1. Confirm `REDIS_URL` on **all** RGS replicas.  
2. `/health` → `rateLimit: redis` (not `memory` when Redis expected).  
3. `/api/v1/admin/ops` → warning if REDIS_URL set but backend memory.  
4. Redis `PING`; check compose network `ws`.

## Deploy checklist

- [ ] `pnpm test:unit` green  
- [ ] `pnpm test:rng:stat` green  
- [ ] `pnpm security:scan` green  
- [ ] `pnpm test:smoke-load` green (or CI smoke-load job)  
- [ ] `pnpm lab:pack:v2` + `lab:verify:drop` recorded  
- [ ] Secrets rotated from defaults (`JWT_SECRET`, `ADMIN_TOKEN`)  
- [ ] `REAL_MONEY=false` until lab + licence  
- [ ] Postgres backup plan if durable  
- [ ] `pnpm deploy:preflight` against target host  

