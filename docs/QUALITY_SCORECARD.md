# Quality scorecard — Western Stampede RGS

Engineering self-assessment against production / lab readiness criteria.  
**Not a marketing comparison.** Scored for release gating on this codebase.

## Host profile (development)

| Resource | Observed |
| --- | --- |
| CPU | AMD Ryzen 7 3700X — 8 cores / 16 threads @ 3.6 GHz |
| RAM | ~16 GB |
| GPU | NVIDIA GeForce RTX 3060 (client rendering only; RNG is CPU) |
| Runtime | Node.js 20+ (dev measured on Node 24) |
| OS | Windows 10/11 |

### Hardware weighting

| Subsystem | Runs on | Implication |
| --- | --- | --- |
| Production RNG | CPU + OS CSPRNG | Single-thread latency critical; sync draw path |
| Math engine / spin | CPU | Fully sync `spinSync` for sim throughput |
| Monte Carlo | All logical CPUs | Worker pool default = `cpus - 2` (14 on 3700X) |
| Math RTP (v1.3.0) | CPU | 10M parallel: **0.9509**; buy tiers ~0.94–0.95 |
| Durable RGS | Postgres | `DATABASE_URL` → real Postgres store + spin TX (not Memory facade) |
| Concurrent spin | Memory mutex / PG TX | Same `clientRoundId` → single debit (tested) |
| E2E CI | Playwright | 6 critical-path tests green (load, spin, buy modal, rules, mute, API) |
| Lab Drop v2 | CPU | `pnpm lab:pack:v2` — MANIFEST + sha256 + sim gate |

| Client Pixi | GPU | Independent of fairness |
| Durable store | Disk + RAM | Postgres optional; memory default for demo |

Bench gates (`pnpm --filter @ws/math-engine bench`):

- Single-thread ≥ **20k** spins/s  
- Parallel ≥ **80k** spins/s on this class of host  

### Measured on this host (2026-03 session)

| Mode | Spins | Workers | Throughput | Gate |
| --- | --- | --- | --- | --- |
| Single `spinSync` + PCG64 | 200k | 1 | ~**104k** spins/s | Pass |
| Parallel workers | 1M | 14 | ~**300–400k** spins/s | Pass |
| Lab package 1M | 1M | 14 | ~**2.5 s** wall | Pass |

Sync path was essential: async `await` per draw previously wasted Ryzen cores on Promise overhead.

## Capability matrix

| Area | Status | Notes |
| --- | --- | --- |
| Server-authoritative outcomes | Pass | Client never owns money result |
| CSPRNG production path | Pass | `@ws/rng-core` + rejection sampling |
| Unbiased range mapping | Pass | Statistical CI gates |
| Draw audit (purpose, id, hash) | Pass | Per-round stream |
| Fail-closed RNG health | Pass | `/ready` 503 |
| Sim vs prod RNG isolation | Pass | PCG64 simOnly + assertProductionRng |
| Math content hash | Pass | Every SpinResult |
| Round replay verification | Pass | `verifySpinReplay` |
| Parallel RTP sim | Pass | worker_threads |
| Multi-frontend protocol | Pass | OpenAPI + Zod + SDK |
| Wallet port | Pass | Demo + operator stub |
| Audit hash chain | Pass | `@ws/audit-core` |
| Rate limit + security headers | Pass | RGS middleware (async; memory/Redis) |
| Redis multi-node rate limit | Pass | optional `REDIS_URL` + `ioredis` |
| OTLP/HTTP JSON export | Pass | zero SDK; admin export/flush |
| Security scan script | Pass | `pnpm security:scan` |
| Lab Drop HMAC sign/verify | Pass | `MANIFEST.hmac` + CLI |
| Lab Drop full verify | Pass | `pnpm lab:verify:drop` (hashes + optional HMAC) |
| Formal lab report | Pass | `05-report/LAB_REPORT.{md,json}` |
| CI security + lab gates | Pass | `security:scan` + signed pack in CI |
| CI headless + load | Pass | `pnpm test:smoke-load` job |
| Redis multi-node RL (prod-like) | Pass | compose redis + REDIS_URL |
| Admin ops snapshot | Pass | `GET /api/v1/admin/ops` + `/version` |
| Deploy preflight | Pass | `pnpm deploy:preflight` |
| Portainer runbook | Pass | durable + prod-like profiles |
| Admin ops console UI | Pass | `/admin.html` + `/admin` |
| Postgres backup/restore | Pass | `scripts/pg-backup.sh` + docs |
| CI Node matrix | Pass | Node 20 + 22 unit jobs |
| Secret rotation runbook | Pass | `docs/security/SECRET_ROTATION.md` |
| Operator onboard CLI | Pass | `pnpm operator:onboard` + admin API |
| Visual E2E in CI | Gated | skip unless `E2E_VISUAL=1` (OS baselines) |
| Round recall / history | Pass | REST |
| Postgres schema | Pass | Ready; memory default |
| Lab package automation | Pass | `lab-harness pack:v2` + sign |
| CI | Pass | GitHub Actions |
| ISO 27001 formal cert | Org | Draft scope only |
| Independent lab cert | External | Not in repo |

## Target vs common open slot/RNG repos (criteria, not brand claims)

| Criterion | Typical demo slot | Typical PRNG lib | This RGS monorepo |
| --- | --- | --- | --- |
| Money path CSPRNG | Rare | N/A | Yes |
| Unbiased scaling docs + tests | Rare | Partial | Yes |
| Draw-level audit | Rare | No | Yes |
| Math version hash | Rare | No | Yes |
| Replay verify | Rare | No | Yes |
| Multi-core RTP harness | Rare | N/A | Yes |
| Operator wallet boundary | Rare | No | Yes |
| Compliance artefacts | Rare | No | Yes |
| Frontend-only RNG | Common | N/A | Forbidden |

## Release checklist

- [ ] `pnpm test` (all packages)  
- [ ] `pnpm test:rng:stat`  
- [ ] `pnpm --filter @ws/math-engine bench`  
- [ ] `pnpm --filter @ws/lab-harness build-package` (or `LAB_SIM_SPINS=10000000` pre-lab)  
- [ ] No `REAL_MONEY=true` without durable store + lab report  
- [ ] Secrets rotated from defaults  
