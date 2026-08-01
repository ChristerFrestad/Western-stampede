# Deploy Western Stampede on Portainer

## Prerequisites

- Portainer with access to a Docker environment
- GitHub repo containing this project (or upload stack from compose)

## Option A — Stack from Git

1. In Portainer: **Stacks → Add stack**
2. Build method: **Repository**
3. Repository URL: your fork/clone of `western-stampede`
4. Compose path: `deploy/docker-compose.yml`
5. Environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `JWT_SECRET` | long random string | Required in production |
| `ADMIN_TOKEN` | long random string | Admin API header `x-admin-token` |
| `RNG_PROVIDER` | `local` | Later: `external` + certified client |
| `TOPUP_MODE` | `demo` | Instant credit; later PSP mode |
| `REAL_MONEY` | `false` | Keep false until licensed |
| `GUEST_START_BALANCE` | `10000` | Demo credits |
| `CORS_ORIGIN` | `*` or your domain | |
| `VITE_API_URL` | empty | Leave empty so nginx proxies `/api` |

6. Deploy the stack.
7. Open `http://<host>:8080` for the game; API on `:3000`.

## Option B — Prebuilt images (GHCR)

Build/push from CI, then replace `build:` sections with:

```yaml
image: ghcr.io/<org>/western-stampede-rgs:latest
```

## Health

- Game UI: `http://host:8080`
- API health: `http://host:3000/health`
- Admin metrics: `GET /api/v1/admin/metrics` with header `x-admin-token`

## Notes

- Current RGS uses **in-memory** sessions/balances (single replica). For multi-replica commercial deploy, swap `MemoryStore` for Postgres (architecture already interface-shaped).
- Demo mode is intentional until certified RNG + license.
