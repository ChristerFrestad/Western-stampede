# Western Stampede — Audio map

Original procedural audio (Web Audio buffers + live layers). Design targets the *feel* of premium western/animal ways cabinets: continuous nature bed while open, mechanical reel clunks, signature premium-animal horn, scatter bell, cascading coins, escalating fanfares, then a resolve hit on total.

Optional sample overrides: `apps/client/public/assets/sfx/{id}.ogg|mp3|wav` (CC0 only — list in `assets/LICENSES.md`). Never ship ripped commercial game audio.

## Buses

| Bus | Role | Default level |
| --- | --- | --- |
| master | Mute / overall | ~0.42 |
| ambient | Wind / nature bed (always on after unlock) | continuous |
| music | Harmonic stem + free/win pulse | ducked on spin/wins |
| sfx | One-shots + spin rumble | full under master |

Ambient + music start on first click/key after load and stay running while the game is open (unless muted).

## Event map

| Event | Method | Character |
| --- | --- | --- |
| UI click | `click()` | Soft high tick |
| Spin start | `spinStart()` | Low rumble loop |
| Reel stop N | `reelStop(reelIndex)` | Clunk; pitch rises L→R |
| Scatter land | `scatterLand()` | Bell / coin ring |
| Wild land | `wildLand()` | Whoosh + spark |
| Longhorn land | `longhornLand()` | Horn bellow (signature) |
| Longhorn win | `longhornWin()` | Stronger horn fanfare |
| Anticipation | `anticipationStart()` / `anticipationStop()` | Rising tension loop |
| Near miss | `nearMiss()` | Falling tone |
| Win cycle | `winCycle()` | Soft two-note |
| Win small / big | `winSmall()` / `winBig()` | Fanfare ladder |
| Free games | `freeGames()` | Bright stinger |
| Stampede | `stampede()` | Low impact / hooves |
| Wheel tick / land | `wheelTick()` / `wheelLand()` | Mechanical + resolve |
| Coin | `coin()` | Bright ping |
| BGM | `startBgm()` / `setMusicStem()` / `stopBgm()` | Western ambient (procedural) |

## Mixing notes

- Prefer one signature land SFX per reel stop (priority: scatter > wild > longhorn > generic clunk).
- Cap simultaneous one-shots mentally (~4); short envelopes only.
- Mute toggles master gain to 0 and stops loops.
- Document any third-party CC0 samples in `assets/LICENSES.md`.
