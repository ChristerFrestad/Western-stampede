# Certification & commercial path

This document is **guidance**, not legal advice.

## What this codebase provides

- Server-authoritative outcomes
- Production `@ws/rng-core` (CSPRNG + rejection sampling + health + draw audit)
- PCG64 **sim-only** generator for Monte Carlo (never money path)
- Versioned math + `mathContentHash` on every round
- Round recall + history API; idempotent `clientRoundId`
- Append-only audit hash chain (`@ws/audit-core`)
- Game protocol Zod schemas + OpenAPI (`@ws/game-protocol`)
- Wallet port abstraction (`@ws/wallet-port`)
- Postgres schema + `PostgresStore` (durable profile); MemoryStore default
- Admin metrics; live math mutate blocked in compliance/real-money
- GLI-19 control matrix + ISO 27001 ISMS scope draft

## What you must add for real-money markets

1. **Licensed operator** / supplier status in target jurisdictions 
2. **Independent lab testing** of RNG + math (GLI / BMM / eCOGRA / etc.) 
3. **GLI-19-style** interactive gaming controls: logging, integrity, player protection 
4. **Persistent durable storage** (Postgres), multi-node safe locks 
5. **KYC/AML**, RG limits, geo, tax as required 
6. **Payment provider** wired to `TopUpIntent` state machine 
7. **No client trust** audits, penetration test, secrets management 

## Production RNG (current)

- Package: `@ws/rng-core` — OS CSPRNG + rejection sampling (`os-csprng+rejection-v1`)
- Design: [compliance/RNG_DESIGN.md](./compliance/RNG_DESIGN.md)
- ADR: [architecture/ADR-001-rng-core.md](./architecture/ADR-001-rng-core.md)
- Per-round streams with `purpose` tags and `drawIds` on every `SpinResult.rngMeta`
- Health fail-closed; `/ready` returns 503 when RNG unavailable
- `RNG_PROVIDER=external` **hard-fails** until a certified client is wired (no silent fallback)
- Live math mutation forbidden when `REAL_MONEY=true` or `COMPLIANCE_MODE=true`

```bash
pnpm test:rng
pnpm test:rng:stat
pnpm lab:meta
pnpm lab:bits 10   # raw bytes for NIST SP 800-22 offline
pnpm lab:pack:v2   # Lab Drop v2 + 05-report/LAB_REPORT
pnpm lab:verify:drop -- lab-output/lab-drop-...
# signed package:
LAB_SIGNING_KEY=... pnpm lab:pack:v2
pnpm security:scan
```

## Swapping RNG

1. Implement entropy / service behind `@ws/rng-core` interfaces (or full `IRngProvider`)
2. Set `RNG_PROVIDER=external` only when fully wired — process must not start otherwise
3. Log `rngMeta` (`algorithm`, `buildId`, `drawIds`) on every round
4. Re-run statistical suite + simulation harness against production math version 

## RTP control

- Adjust reel strips / feature weights via admin API or config deploy 
- Pin `mathVersion` on rounds 
- Run `pnpm math:sim <spins>` before activating a profile 
