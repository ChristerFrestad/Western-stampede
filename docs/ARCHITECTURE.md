# Western Stampede — Architecture

## Principles

1. **Server-authoritative** — Client only renders; RGS decides grid, wins, features, balances.
2. **Certifiable RNG** — `@ws/rng-core` (OS CSPRNG + rejection sampling, per-round streams, purpose tags, fail-closed health). See `docs/compliance/RNG_DESIGN.md`.
3. **Math as data** — Strips, paytable, feature weights, buy prices versioned (`mathVersion` + `mathContentHash`).
4. **Wallet adapter** — Debit → spin → credit; top-up intents for future PSP.
5. **Idempotent spins** — `clientRoundId` prevents double debit on retry.
6. **Audit trail** — Every round stored with stops, grid, wins, debit, RNG meta (`drawIds`, algorithm, buildId).

## Packages

| Package | Role |
| --- | --- |
| `@ws/shared` | Symbol IDs, DTOs |
| `@ws/rng-core` | Production RNG (entropy, unbiased map, health, draw audit) |
| `@ws/math-engine` | Strips, ways eval, features, PCG64 sim, sim CLI |
| `@ws/game-protocol` | Zod schemas, OpenAPI, multi-frontend client SDK |
| `@ws/wallet-port` | Operator wallet boundary (demo + HTTP stub) |
| `@ws/audit-core` | Append-only hash chain for audit events |
| `@ws/rgs-api` | Express RGS: multi-tenant auth, spin TX, wallet, admin, history |
| `@ws/client-e2e` | Playwright critical-path E2E |
| `@ws/headless-client` | Second protocol consumer (smoke) |
| `@ws/lab-harness` | NIST bit export + lab package meta |
| `@ws/client` | PixiJS presentation |

## Spin flow

```
Client --POST /game/spin {bet, clientRoundId, buyTier?}--> RGS
RGS checks session, balance, free-game state
RGS SpinEngine.spin() via IRngProvider
RGS debit / credit wallet, persist round
RGS <-- SpinResult JSON --
Client animates reels to server grid; never recomputes money
```

## Certification path

1. Keep math deterministic given RNG stream.
2. Export rounds + sim reports for lab.
3. Set `RNG_PROVIDER=external` and implement remote draws.
4. Do not enable `REAL_MONEY=true` until licensed + certified.
