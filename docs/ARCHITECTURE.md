# Western Stampede — Architecture

## Principles

1. **Server-authoritative** — Client only renders; RGS decides grid, wins, features, balances.
2. **Pluggable RNG** — `IRngProvider` (`local-crypto` today; external certified later).
3. **Math as data** — Strips, paytable, feature weights, buy prices versioned (`mathVersion` on every round).
4. **Wallet adapter** — Debit → spin → credit; top-up intents for future PSP.
5. **Idempotent spins** — `clientRoundId` prevents double debit on retry.
6. **Audit trail** — Every round stored with stops, grid, wins, debit, RNG meta.

## Packages

| Package | Role |
| --- | --- |
| `@ws/shared` | Symbol IDs, DTOs |
| `@ws/math-engine` | Strips, ways eval, free games, Supercoin, Stampede, sim CLI |
| `@ws/rgs-api` | Express RGS: auth, spin, wallet, admin |
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
