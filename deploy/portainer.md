# Deploy Western Stampede on Portainer

## Hurtigstart (casino preset — spill med en gang)

1. **Stacks → Add stack**  
2. Build method: **Repository**  
3. **Repository URL:** `https://github.com/ChristerFrestad/Western-stampede`  
4. **Branch:** `main`  
5. **Compose path:** `docker-compose.yml`  
6. Private repo? → GitHub PAT med `repo` / `contents:read`  
7. **Deploy the stack** (ingen env påkrevd)  
8. Vent til containers er healthy  

| Hva | URL |
| --- | --- |
| **Spill** | `http://<host>:18080` |
| **Admin** | `http://<host>:18080/admin.html` |
| API | `http://<host>:13000/health` |

**Admin-token (default):** `dev-admin-token`

Åpne Spill → automatisk guest → Spin.  
Admin er valgfritt (metrics / RTP / warnings).

---

## Casino preset

Compose default:

- `WS_PRESET=casino`
- `GUEST_START_BALANCE=100000`
- Memory store (ingen Postgres påkrevd)
- Demo top-up, CSPRNG, ~95% RTP math

Bytt secrets senere:

| Variable | Default | Anbefaling for delt nett |
| --- | --- | --- |
| `ADMIN_TOKEN` | `dev-admin-token` | lang tilfeldig streng |
| `JWT_SECRET` | `dev-secret` | lang tilfeldig streng |
| `WEB_PORT` | `18080` | endre ved port-kollisjon |
| `RGS_PORT` | `13000` | endre ved port-kollisjon |

---

## Profiles (valgfritt)

| Profile | Compose | Use case |
| --- | --- | --- |
| **default / casino** | `docker-compose.yml` | Spill nå (anbefalt) |
| **durable** | profile `durable` | + Postgres (+ Redis) |
| **prod-like** | + `docker-compose.prod-like.yml` | 2× RGS, nginx LB, Postgres, Redis |

### Durable

| Variable | Example |
| --- | --- |
| `DATABASE_URL` | `postgres://ws:ws@postgres:5432/western_stampede` |
| `REDIS_URL` | `redis://redis:6379` (valgfritt) |

### Prod-like

```bash
docker compose -f docker-compose.yml -f docker-compose.prod-like.yml --profile prod-like config > stack.prod-like.yml
```

---

## Feilsøking

| Problem | Fix |
| --- | --- |
| Unable to retrieve container | Portainer environment offline — se under |
| `reference not found` | Branch **`main`** |
| Port already allocated | `WEB_PORT=18081` / `RGS_PORT=13001` |
| Client up, spin fails | Sjekk `rgs-api` healthy + `/health` |
| Admin 403 | Feil token — default `dev-admin-token` |

### Portainer environment offline

1. Home → Environments → Connected  
2. Docker Engine / socket / Agent OK  
3. Riktig environment valgt  
4. Evt. slett stack og lag ny fra Git `main`

```bash
docker ps
docker logs <rgs-api-container> --tail 80
```

---

## Etter deploy

```bash
curl -s http://<host>:13000/health
# expect preset: "casino", guestStartBalance: 100000

# Admin i nettleser:
# http://<host>:18080/admin.html
```

Backup (durable): [docs/compliance/BACKUP_RESTORE.md](../docs/compliance/BACKUP_RESTORE.md)  
Secrets: [docs/security/SECRET_ROTATION.md](../docs/security/SECRET_ROTATION.md)
