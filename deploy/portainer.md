# Deploy Western Stampede on Portainer

## Stack from Git (recommended)

1. Portainer → **Stacks → Add stack**
2. Build method: **Repository**
3. **Repository URL:** `https://github.com/ChristerFrestad/Western-stampede`
4. **Reference / Branch:** `main` (required — do not use `master`)
5. **Compose path:** `docker-compose.yml`  
   - Leave default if Portainer defaults to root `docker-compose.yml`  
   - Do **not** use `deploy/docker-compose.yml` unless your Portainer supports Compose `include`
6. Authentication: if the repo is private, add a GitHub credential / PAT with `repo` scope
7. Environment variables (optional overrides):

| Variable | Example | Notes |
| --- | --- | --- |
| `JWT_SECRET` | long random string | Required in production |
| `ADMIN_TOKEN` | long random string | Admin API header `x-admin-token` |
| `RNG_PROVIDER` | `local` | Later: certified external RNG |
| `TOPUP_MODE` | `demo` | Instant credit; later PSP mode |
| `REAL_MONEY` | `false` | Keep false until licensed |
| `GUEST_START_BALANCE` | `10000` | Demo credits |
| `CORS_ORIGIN` | `*` | Or your domain |
| `VITE_API_URL` | empty | Leave empty so nginx proxies `/api` |
| `WEB_PORT` | `8080` | Host port for the game UI |
| `RGS_HOST_PORT` | `127.0.0.1:13000` | Host bind for API (default avoids port 3000 clash) |

8. Deploy the stack  
9. Open `http://<host>:8080` (game). API is reached via the same origin (`/api`, `/health` through nginx).

## Common errors

| Error | Fix |
| --- | --- |
| `reference not found` | Branch must be **`main`**, not `master` |
| `open .../docker-compose.yml: no such file` | Compose path must be **`docker-compose.yml`** at repo root |
| `address already in use` (port 3000) | Fixed: API no longer binds host `:3000`. Redeploy latest `main`. If 8080 is busy, set `WEB_PORT=18080` |
| Clone auth failed | Add Portainer Git credentials for private repos |

## Health

- Game UI: `http://host:8080` (or `WEB_PORT`)
- API health (via nginx): `http://host:8080/health`
- Optional direct API (localhost): `http://127.0.0.1:13000/health`
- Admin metrics: `GET /api/v1/admin/metrics` with header `x-admin-token`

## Notes

- RGS uses in-memory sessions (single replica). Swap store for Postgres for multi-node commercial use.
- Demo mode is intentional until certified RNG + license.
