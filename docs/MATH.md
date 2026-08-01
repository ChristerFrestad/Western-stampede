# Math notes — Western Stampede 1.1.0

## Target

- Configured RTP target: **~95%**
- Empirical base sim (seeded): see `pnpm math:sim`
- Buy costs calibrated for **~95% buy RTP** from free-game session EV

## Buy balance (policy A)

Same free-game strips/paytable as natural. Costs from session EV:

| Tier | costX | free games | Notes |
| --- | --- | --- | --- |
| standard | 22 | 8 | ≈ natural 3 scatters |
| enhanced | 80 | 15 | Supercoin on entry |
| premium | 145 | 20 | Supercoin + stampede boost |

```bash
pnpm math:sim 1000000
pnpm math:sim:buy 10000
```

## Tuning knobs

| Knob | File / API |
| --- | --- |
| Paytable | `packages/math-engine/src/config/default-math.ts` |
| Reel strips | same |
| Stampede / Supercoin | `DEFAULT_FEATURE_WEIGHTS` or `PUT /api/v1/admin/math/features` |
| Buy cost × | `DEFAULT_BUY_OPTIONS` |

Pin `mathVersion` on every round. When retuning, bump `MATH_VERSION`.
