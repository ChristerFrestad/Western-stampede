# Math notes — Western Stampede 1.0.0

## Target

- Configured RTP target: **~95%**
- Empirical sim (seeded, 250k spins): **~92.5%** (within demo tolerance; retune via admin / strip edits)
- Hit rate: ~7%
- Free game entry: ~0.7% of all spins (~1 per ~120–140 base spins)
- Stampede: ~0.19% of spins

## Commands

```bash
pnpm math:sim 1000000
```

## Tuning knobs

| Knob | File / API |
| --- | --- |
| Paytable | `packages/math-engine/src/config/default-math.ts` |
| Reel strips | same |
| Stampede / Supercoin | `DEFAULT_FEATURE_WEIGHTS` or `PUT /api/v1/admin/math/features` |
| Buy cost × | `DEFAULT_BUY_OPTIONS` |

Pin `mathVersion` on every round. When retuning, bump `MATH_VERSION`.
