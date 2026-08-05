# Frontend QA checklist — Western Stampede

Manual / visual QA for premium cabinet UX. Outcomes are always server-authoritative.

## Preflight

```bash
pnpm dev:api
pnpm dev:client
# open http://localhost:5173
```

## Critical paths

| # | Path | Expect |
| --- | --- | --- |
| 1 | Load | Balance shows; no console errors; reels visible |
| 2 | First click | Sound unlocks (wind/bed); mute shows SOUND |
| 3 | Base spin | Rumble → L→R stops → wins or idle |
| 4 | Space skip | During celebration advances one phase only |
| 5 | Buy modal | Three tier cards; prices from config (19× / 63× / 118× on v1.3) |
| 6 | Buy standard | Debit correct; free loop runs; FG meter `remaining / total` |
| 7 | Buy enhanced | Wheel + inject before reels; herd meter pulses |
| 8 | Free end | Feature total splash; BGM back to base |
| 9 | Rules | Buy line matches config; RTP % shown |
| 10 | Mute | MUTED silences; SOUND restores |
| 11 | Low balance | Buy tier disabled if unaffordable; toast on spin fail |
| 12 | Mobile 390px | Controls tappable; meters readable |

## Presentation skip (feature)

| Overlay | Space / click |
| --- | --- |
| Feature splash | Ends splash early |
| Supercoin wheel | Snaps to result + continue |
| Longhorn inject | Ends inject early |

## Regression

- Never trust client grid for money
- Bet locked chip during free games
- Autoplay shortens ceremonies; STOP clears autoplay on insufficient funds

## Automated

```bash
pnpm test:e2e
# includes: critical path, buy/free API, visual (local), axe a11y
# Visual is skipped in CI unless E2E_VISUAL=1 (OS/font-specific baselines)
# pnpm test:e2e -- --update-snapshots
```

## Sign-off

- [ ] Desktop Chrome
- [ ] Desktop Firefox
- [ ] Mobile Safari / Chrome width
- [ ] Headphones audio pass (base + free + wheel + big win)
- [ ] `pnpm test:e2e` green

