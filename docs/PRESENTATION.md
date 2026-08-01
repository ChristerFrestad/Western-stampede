# Western Stampede — Presentation contract

Client-only presentation rules. Outcomes are always server-authoritative; skip never changes money.

## Spin phases

1. **Idle** — board shows last grid; BGM stem `base` or `free`.
2. **Spin start** — all reels blur + scroll together; spin rumble SFX; music ducks slightly.
3. **Simultaneous spin** — minimum ~550 ms.
4. **Stop L→R** — each reel eases to server symbols; per-reel stop SFX; symbol-specific land SFX (scatter / wild / longhorn) when present in that reel’s final window.
5. **Anticipation** — when 2 scatters are locked (or 1 early scatter): remaining reels use long ease; visual boots (dim + glow); rising anticipation audio.
6. **Near miss** — 2 scatters, no free-game trigger: brief falloff SFX + flash.
7. **Wild reveal** — contributing wilds expand from art, then ×2/×3 badge.
8. **Reel wins** — each `WinDetail` in sequence: dim others → L→R cell light → win pill (symbol · count · ways · amount · wild mult).
9. **Count-up** — racing meter; threshold flashes for BIG / MEGA / SUPER.
10. **Banners** — full banners for earned tiers; Space/click skip ladder.
11. **Feature ceremony** — free enter / retrigger / stampede / supercoin / free end (order in `main.ts`).

## Skip ladder (one Space / click = one step)

1. **reel_wins** → abort remaining combos → **counting**
2. **counting** → snap to full amount → next phase
3. **banner_big** → **banner_mega** → **banner_super** (only earned tiers)
4. **total** — always shows **YOU WON** + spin total (and feature pot if free games)
5. Leave **total** → back to idle board / next free spin

Never jump from first Space straight to idle when tier banners or total remain.

## Win clarity rules

- Only cells listed in `WinDetail.cells` stay bright for that combo.
- Light-up order is left-to-right by reel index.
- Wild multipliers that contributed stay visible during that combo’s cycle.
- Turbo / autoplay uses a single aggregate pulse.

## Feature transitions

| Transition | Presentation |
| --- | --- |
| Base → free | Splash + free BGM stem |
| Retrigger | Short splash + FG meter bump |
| Stampede | Splash + board height change to 4-10-10-10-4 |
| Supercoin | Wheel overlay (server value; client lands matching segment) |
| Free end | Splash with feature total + BGM back to base |

## IP / branding

All art, names, and copy are original to Western Stampede. Do not reference third-party game titles in code, docs, commits, or UI.
