# Western Stampede

Server-authoritative western **ways** slot (HTML5). Demo / social play with a **casino-level preset** — deploy and play immediately.

- **4-6-6-6-4** grid · **3,456 ways** (Stampede → **16,000**)
- Free games, buy bonus (19× / 63× / 118×), Supercoin, Stampede
- ~**95% RTP** math v1.3.0 · production CSPRNG (`@ws/rng-core`)
- Guest wallet auto-login · top-up demo · Admin ops console

> **Not real-money gambling** until licensed + lab-certified. Casino preset = floor-style demo.

---

## Spill i Portainer (anbefalt — null konfig)

1. Portainer → **Stacks → Add stack**
2. **Repository:** `https://github.com/ChristerFrestad/Western-stampede`
3. **Branch:** `main`
4. **Compose path:** `docker-compose.yml`
5. **Deploy** (ingen env-variabler påkrevd)
6. Vent til `client` + `rgs-api` er healthy

| Hva | URL |
| --- | --- |
| **Spill** | `http://<din-host>:18080` |
| **Admin** | `http://<din-host>:18080/admin.html` |
| API health | `http://<din-host>:13000/health` |

Åpne **Spill** → saldo lastes automatisk → **Spin**. Ferdig.

Detaljer / feilsøking: [deploy/portainer.md](deploy/portainer.md)

---

## Hvor er Admin?

| Felt | Verdi |
| --- | --- |
| **URL** | `http://<host>:18080/admin.html` (eller `http://<host>:13000/admin`) |
| **Token** | `dev-admin-token` (default casino/demo) |
| **I spillet** | Badge **Admin** øverst til høyre |

1. Åpne Admin-URL  
2. Token er forhåndsutfylt som `dev-admin-token` (eller lim inn din `ADMIN_TOKEN`)  
3. **Refresh** → metrics, RTP, deploy-warnings  

Bytt token senere i Portainer env `ADMIN_TOKEN` + restart. Se [docs/security/SECRET_ROTATION.md](docs/security/SECRET_ROTATION.md).

Admin er **valgfritt** — du trenger den ikke for å spille.

---

## Casino preset (hva er ferdig satt)

Default stack bruker `WS_PRESET=casino`:

| Innstilling | Verdi | Betydning |
| --- | --- | --- |
| Startsaldo | **100 000** credits | Nok til spin + buy bonus |
| Wallet | Demo top-up | Ingen PSP |
| RNG | OS CSPRNG | Produksjonssti |
| RTP-mål | ~95% | Math v1.3.0 |
| Guest | Auto ved side-last | Ingen login |
| Admin-token | `dev-admin-token` | Kun for ops |

Eksplisitte env-variabler i Portainer **overstyrer** preset.

---

## Valgfritt senere

| Behov | Hvordan |
| --- | --- |
| Sterkere secrets | Sett `JWT_SECRET`, `ADMIN_TOKEN` i Portainer |
| Lagring over restart | Profile **durable** + `DATABASE_URL` (Postgres) |
| Multi-RGS + Redis | [docker-compose.prod-like.yml](docker-compose.prod-like.yml) |
| Ny operator-nøkkel | `pnpm operator:onboard -- --code acme --smoke` |
| Lab-pakke | `pnpm lab:pack:v2` |

---

## Dev quick start

```bash
pnpm install
pnpm --filter @ws/shared build
pnpm --filter @ws/rng-core build
pnpm --filter @ws/math-engine build
pnpm dev
# Client http://localhost:5173  ·  RGS http://localhost:3000
# Admin  http://localhost:5173/admin.html
```

```bash
copy .env.example .env   # Windows
```

## Tester / lab / security

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:smoke-load
pnpm security:scan
pnpm lab:pack:v2
pnpm deploy:preflight
```

Scorecard: [docs/QUALITY_SCORECARD.md](docs/QUALITY_SCORECARD.md)  
Ops: [docs/compliance/RUNBOOK_OPS.md](docs/compliance/RUNBOOK_OPS.md)

## Docker lokalt

```bash
docker compose up --build
# Spill :18080  Admin :18080/admin.html  API :13000
```

## API (kort)

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/guest` | — |
| POST | `/api/v1/game/spin` | Bearer |
| GET | `/api/v1/admin/ops` | `x-admin-token` |
| POST | `/api/v1/admin/operators` | super-admin |

Default demo operator key (dev): `demo-api-key-change-me`

## License

See [LICENSE](LICENSE).
