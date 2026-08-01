# Western Stampede — Audio design (presentation)

Original procedural audio. **No third-party game assets.** Design targets the *feel* of premium western / animal ways cabinets: continuous nature bed, mechanical reels, signature premium animal, free-feature energy lift, and loud floor presence (player can lower device volume).

## Expert timeline (what plays when)

| Moment | Layers | Character |
| --- | --- | --- |
| **App open / idle** | Wind bed + harmonic pad + sparse color tones | Always-on immersion; never silent after unlock |
| **Spin press** | Spin rumble (saw + noise) | Music/ambient duck ~40% |
| **Each reel stop (L→R)** | Heavy clunk + noise thud; pitch/weight rises | Clear “machine” identity |
| **Scatter / Supercoin land** | Bright multi-partial bell + coin ping | High, metallic, unmistakable |
| **Wild land** | Whoosh + chime cluster | Magical substitute feel |
| **Longhorn land** | Deep bellow (saw formant) + low impact | Signature premium animal |
| **Anticipation (2 scatters path)** | Rising dual sine + heartbeat drums | Tension until last reels stop |
| **Near miss** | Falling tone + soft whoosh | Release without reward |
| **Win cycle (per combo)** | Short chime cluster | Marks composition |
| **Count-up** | Rapid coin ticks | Race meter energy |
| **BIG / MEGA / SUPER** | Layered brass fanfare + impact + coin cascade | Escalating length & density |
| **YOU WON total** | Resolve chord + coins | Closure before idle |
| **Free enter / retrigger** | Fanfare + drum hits; **music stem → free** | Percussive, higher drive |
| **Free idle** | Free pad + tribal pulse | Louder pulse than base |
| **Stampede** | Double impact + horn + whoosh | Hooves / earth |
| **Supercoin wheel** | Tick coins while spin; bell + cluster on land | Mechanical then reward |
| **Longhorn inject** | Horn bursts while icons fly | Herd growing |

## Loudness targets (cabinet-like)

| Bus | Relative | Notes |
| --- | --- | --- |
| master | ~0.92 + compressor | Hot floor; user turns device down |
| ambient (wind) | high continuous | Never “is the sound on?” |
| music | high, ducked on spin/wins | Free stem more energetic |
| sfx | dominant on events | Clunks/bells cut through bed |

Soft knee compressor on master prevents digital clip while keeping average level high.

## Implementation

- `apps/client/src/audio.ts` — Web Audio buffers + live layers
- Optional file overrides: `/assets/sfx/{id}.ogg|mp3|wav` (CC0 only; list in `assets/LICENSES.md`)
- Unlock on first click/key (browser autoplay policy)

## Mute

`setMuted(true)` zeros master and stops loops; unmute restarts wind + current stem.
