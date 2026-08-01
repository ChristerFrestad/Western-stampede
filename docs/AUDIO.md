# Western Stampede — Audio map

Synthesized Web Audio is the default. Optional sample files may be placed under `apps/client/public/assets/sfx/` (same id + `.ogg` / `.mp3`); the client falls back to synth when a sample is missing.

## Buses

| Bus | Role | Default level |
| --- | --- | --- |
| master | Mute / overall | 0.35 |
| music | BGM loops | ~−18 dB relative |
| sfx | One-shots + spin loops | full under master |

Music ducks during spin and big celebrations.

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
