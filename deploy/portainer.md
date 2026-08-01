# Deploy Western Stampede on Portainer

## Stack from Git (recommended)

1. Portainer → **Home** → select a **healthy** Environment (green / connected)  
2. **Stacks → Add stack**  
3. Build method: **Repository**  
4. **Repository URL:** `https://github.com/ChristerFrestad/Western-stampede`  
5. **Reference / Branch:** `main` (not `master`)  
6. **Compose path:** `docker-compose.yml`  
7. If the repo is **private**: Repository authentication → GitHub PAT with `repo` (or `contents:read`)  
8. Environment variables (optional):

| Variable | Example | Notes |
| --- | --- | --- |
| `JWT_SECRET` | long random string | Production secret |
| `ADMIN_TOKEN` | long random string | Header `x-admin-token` |
| `RNG_PROVIDER` | `local` | |
| `TOPUP_MODE` | `demo` | |
| `REAL_MONEY` | `false` | |
| `GUEST_START_BALANCE` | `10000` | |
| `CORS_ORIGIN` | `*` | |
| `VITE_API_URL` | *(empty)* | nginx proxies `/api` |
| `WEB_PORT` | `18080` | UI host port |
| `RGS_PORT` | `13000` | API host port (optional; UI uses nginx) |

9. **Deploy the stack**  
10. Open `http://<host>:18080`

---

## Error: “Unable to retrieve container” / “Failed loading environment”

This is almost always **Portainer’s Docker environment**, not the game code.

### Fix checklist

1. **Environment online**  
   Home → Environments → your Docker host must be **Connected** (not down/unreachable).

2. **Local Docker**  
   On the Portainer host: Docker Engine running, and Portainer can access the socket  
   (`/var/run/docker.sock` or Agent).

3. **Wrong environment selected**  
   Top-right / left nav: pick the same environment the stack was created under.

4. **Stale stack after agent rebuild**  
   Delete the stack (optional: remove containers) → create a **new** stack from Git on `main`.

5. **Agent (remote Docker)**  
   Redeploy Portainer Agent; ensure network from Portainer CE/BE → agent port (usually 9001).

6. **Do not put `ip:port` in one env default**  
   Use separate simple vars (`RGS_PORT=13000`, `WEB_PORT=18080`) — already set this way in compose.

### Quick host checks (SSH on Docker machine)

```bash
docker ps
docker compose version
# if stack name is westernstampede / western-stampede:
docker ps -a | grep -i stampede
docker logs <rgs-api-container> --tail 50
```

---

## Common compose/deploy errors

| Error | Fix |
| --- | --- |
| `reference not found` | Branch **`main`** |
| `docker-compose.yml: no such file` | Compose path **`docker-compose.yml`** |
| `port is already allocated` | Set `WEB_PORT=18081` or free 18080 / 13000 |
| Clone auth failed | GitHub credential / public repo |
| Failed loading environment | See section above |

## Health

- Game: `http://host:18080`
- API via UI: `http://host:18080/health`
- Direct API: `http://host:13000/health`

## Notes

- In-memory RGS (single replica).  
- Demo mode until licensed + certified RNG.
