# Western Stampede

Server-authoritative HTML5 ways slot with an original western theme (demo / social play).

- **4-6-6-6-4** grid · **3,456 ways** (Stampede → **16,000**)
- Free games from scatters (8 / 15 / 20) + retriggers
- **Buy bonus** (80× / 150× / 250×)
- **Supercoin** wheel (extra longhorn injection on feature strips)
- **Stampede** expand feature
- Demo wallet + **top-up stub** for later PSP
- Pluggable **RNG** for future certified integration
- Admin API to adjust feature weights / view empirical RTP
- **Docker Compose** for Portainer

> **Demo / social play only.** Not real-money gambling until licensed + lab-certified.

## Quick start (dev)

```bash
# Node 20+ and pnpm
pnpm install
pnpm --filter @ws/shared build
pnpm --filter @ws/math-engine build

# Terminal 1 — RGS
pnpm dev:api

# Terminal 2 — client (http://localhost:5173, proxies /api → :3000)
pnpm dev:client
```

## Math simulation

```bash
pnpm math:sim 100000
```

## Tests

```bash
pnpm --filter @ws/math-engine test
```

## Docker / Portainer

```bash
cd deploy
docker compose up --build
# UI http://localhost:8080  API http://localhost:3000/health
```

See [deploy/portainer.md](deploy/portainer.md).

## API (summary)

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/guest` | — |
| GET | `/api/v1/game/config` | — |
| POST | `/api/v1/game/spin` | Bearer |
| GET | `/api/v1/wallet` | Bearer |
| POST | `/api/v1/wallet/topup` | Bearer |
| GET | `/api/v1/admin/metrics` | `x-admin-token` |

## Docs

- [Game rules](docs/GAME_RULES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Certification path](docs/CERTIFICATION_PATH.md)

## License

MIT — see [LICENSE](LICENSE). Keep third-party assets documented in [assets/LICENSES.md](assets/LICENSES.md).
