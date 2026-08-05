# Math notes — Western Stampede 1.3.0

## Target

- Configured RTP target: **95%**
- Math version: `western-stampede-1.3.0`
- Content hash: run `pnpm lab:meta` or see latest lab package

## Calibration record (v1.3.0)

| Method | N | Result | Notes |
| --- | --- | --- | --- |
| Pre-scale baseline (v1.2 pays) | 5M parallel PCG | base RTP **0.9972** | Too high |
| Scale factor | — | **×0.9526** on all per-way pays | Linear EV scale |
| Post-scale base | **10M** parallel (14 workers) | **0.950856** | Within ±0.5% of 0.95 |
| Hit rate | 10M | ~0.279 | Stable |
| Free trigger rate | 10M | ~0.00226 | ~1 / 443 base spins |
| Stampede rate | 10M | ~0.00193 | ~1 / 517 |

### Buy bonus (12 000 sessions / tier, PCG)

| Tier | costX | free games | buy RTP | mean mult |
| --- | --- | --- | --- | --- |
| standard | **19** | 8 | **0.942** | 17.90 |
| enhanced | **63** | 15 + Supercoin entry | **0.946** | 59.61 |
| premium | **118** | 20 + Supercoin + stampede boost | **0.953** | 112.45 |

Buy costs set to ≈ `meanSessionMult / 0.95` after paytable scale.

Host: Ryzen 7 3700X, ~470k spins/s parallel.

## Commands

```bash
pnpm math:sim 10000000 --parallel
pnpm math:sim:buy 12000
pnpm lab:package
pnpm --filter @ws/math-engine par
```

## Buy balance (policy)

Same free-game strips/paytable as natural. Costs from session EV at 95% target.

| Tier | costX | free games | Notes |
| --- | --- | --- | --- |
| standard | 19 | 8 | ≈ natural 3 scatters |
| enhanced | 63 | 15 | Supercoin on entry |
| premium | 118 | 20 | Supercoin + stampede boost |

## Tuning knobs

| Knob | File / API |
| --- | --- |
| Paytable | `packages/math-engine/src/config/default-math.ts` |
| Reel strips | same |
| Stampede / Supercoin | `DEFAULT_FEATURE_WEIGHTS` |
| Buy cost × | `DEFAULT_BUY_OPTIONS` |

Pin `mathVersion` + `mathContentHash` on every round. When retuning, bump `MATH_VERSION` and re-run 10M+ sim.
