# Secret rotation — Western Stampede RGS

## Secrets inventory

| Secret | Env / location | Used for | Rotate when |
| --- | --- | --- | --- |
| `JWT_SECRET` | env | Session material / signing surface | Leak, staff change, quarterly |
| `ADMIN_TOKEN` | env | Super-admin (`x-admin-token`) | Leak, staff change, quarterly |
| `SUPER_ADMIN_TOKEN` | env (optional) | Alternate super token | Same as admin |
| Operator API keys | DB hash only | `X-Operator-Key` B2B launch | Per operator request / leak |
| `LAB_SIGNING_KEY` | env / CI secret | Lab Drop HMAC | Leak; after personnel change |
| `DATABASE_URL` password | env / secret store | Postgres | Credential policy |
| Redis password (if any) | `REDIS_URL` | Rate limit multi-node | Credential policy |
| Wallet operator keys | env seamless mode | Outbox wallet | Operator-side rotation |

**Never** commit production values. Defaults (`dev-secret`, `dev-admin-token`, `demo-api-key-change-me`) are **demo only**.

## Pre-rotation checklist

- [ ] Identify blast radius (who has old secret)
- [ ] Schedule low-traffic window if multi-instance
- [ ] Confirm backup if DB-related ([BACKUP_RESTORE.md](../compliance/BACKUP_RESTORE.md))
- [ ] `PREFLIGHT_STRICT=true` ready for post-check

## JWT_SECRET

1. Generate: `openssl rand -hex 32` (or equivalent).  
2. Deploy new value to **all** RGS replicas simultaneously (rolling with dual-read is not implemented — expect session invalidation).  
3. Restart RGS.  
4. Existing player sessions fail → clients re-auth (guest or operator session).  
5. `pnpm deploy:preflight` with new env.

## ADMIN_TOKEN / SUPER_ADMIN_TOKEN

1. Generate ≥16 char high-entropy token.  
2. Update Portainer / secret store / compose.  
3. Restart RGS.  
4. Update ops console sessionStorage, CI secrets, runbooks.  
5. Old token → `403` on `/api/v1/admin/*`.

```bash
# verify
curl -s -H "x-admin-token: $NEW_TOKEN" "$RGS_URL/api/v1/admin/ops" | jq .ready
```

## Operator API key

Raw key is shown **once** at create/rotate. Only SHA-256 hash is stored.

```bash
# create
ADMIN_TOKEN=... RGS_URL=... pnpm operator:onboard -- --code acme --name "Acme" --smoke

# rotate (invalidates previous key immediately)
ADMIN_TOKEN=... RGS_URL=... pnpm operator:onboard -- --code acme --rotate --smoke
```

Deliver new key to operator via secure channel (not chat logs).  
Audit events: `admin.operator.create`, `admin.operator.rotate_key`.

## LAB_SIGNING_KEY

1. Generate ≥16 char secret.  
2. Update CI `secrets.LAB_SIGNING_KEY` and local env.  
3. Re-pack: `LAB_SIGNING_KEY=... pnpm lab:pack:v2`.  
4. Old drops verify only with old key — archive key if historical packages must verify.

## DATABASE_URL / Redis

Follow managed Postgres / Redis provider rotation.  
Update compose/Portainer, restart dependents, run preflight + smoke-load.

## Post-rotation verification

```bash
export RGS_URL=... ADMIN_TOKEN=... JWT_SECRET=...  # process env for strict checks
PREFLIGHT_STRICT=true pnpm deploy:preflight
pnpm test:smoke-load   # or CI smoke-load job
```

Expect:

- No default secret warnings in `/api/v1/admin/ops`  
- Guest spin + operator session OK  
- Admin ops `ready: true`

## Emergency revoke

| Situation | Action |
| --- | --- |
| Admin token leaked | Rotate immediately; review audit chain |
| Operator key leaked | `operator:onboard --rotate` for that code |
| Entire host compromised | Rotate all secrets + DB password; restore from known-good backup if needed |

## Related

- [PENTEST_CHECKLIST.md](./PENTEST_CHECKLIST.md)  
- [RUNBOOK_OPS.md](../compliance/RUNBOOK_OPS.md)  
- Ops UI: `/admin.html`  
