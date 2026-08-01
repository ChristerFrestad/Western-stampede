# E2E spin & graphics analysis

## Intended spin sequence (Vegas)

| Step | Behavior |
| --- | --- |
| 1 | **All 5 reels start spinning together** (blur + continuous scroll) |
| 2 | Min ~550ms simultaneous spin |
| 3 | Reels **stop left → right** (stagger); others keep spinning until their turn |
| 4 | Anticipation reels (2 scatters) use longer ease |
| 5 | Final window = server grid only |
| 6 | Win director: wilds → each combo → count-up / banners |

### Bugs fixed (2026-08)

1. **Reels spun one-at-a-time** — `await stopReel` ran before the next reel started.  
   **Fix:** continuous parallel spin on all reels, then sequential stop.  
2. **Win FX zoomed to image corner** — `sprite.scale` used on sprites laid out with `width`/`height` and anchor (0,0).  
   **Fix:** pulse via tint/alpha + gold frames only; `layoutSprite` always resets geometry.

## Win-rate verification

```bash
pnpm --filter @ws/math-engine test   # includes win-rate smoke
pnpm math:sim 200000                 # full base RTP
pnpm math:sim:buy 5000               # buy tier RTP
```

| Metric | Expected band (demo math v1.1) |
| --- | --- |
| Base RTP (long sim) | ~0.85 – 1.05 |
| Hit rate | ~3% – 25% |
| Buy RTP standard/enhanced/premium | ~0.7 – 1.2 (calibrated ~0.9) |

## Graphics checklist (manual)

- [ ] All reels blur at spin start  
- [ ] Staggered stops L→R while trailing reels still move  
- [ ] Symbols stay centered in cells on win (no corner zoom)  
- [ ] Wild ×2/×3 badge centered on wild cell  
- [ ] Combo pills + BIG/MEGA banners when thresholds hit  
- [ ] Space skips celebration without breaking next spin  

## Client unit tests

```bash
pnpm --filter @ws/client exec node --import tsx --test src/presentation/spin-timing.test.ts
```
