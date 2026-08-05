# Asset licenses

## Code

Project source: see root `LICENSE` (MIT unless otherwise noted).

## Runtime fonts (client)

- **Bebas Neue**, **Outfit** — loaded from Google Fonts (SIL Open Font License).

## Symbols & art (v1)

- Symbol icons, desert background, cabinet frame, free-game splash, and Supercoin wheel art in `apps/client/public/assets/` were generated with **xAI Imagine** for this project (original assets).
- Premium reel tiles (LONGHORN, WILD, WILD_FG, SCATTER, SUPERCOIN) regenerated as square cover-fit masters (presentation pass).
- High/low symbols (STAG, WOLF, COYOTE, EAGLE, A–9) and desert BG regenerated for uniform optical size (full set pass).
- Reel chrome, cover-fit masks, motion blur, and layout are code-driven in PixiJS (`apps/client/src/reel-view.ts`, `presentation/symbol-fit.ts`).
- SFX and BGM are synthesized in-browser via Web Audio (`apps/client/src/audio.ts`) by default — no third-party sample packs required.
- Optional sample overrides may be added under `apps/client/public/assets/sfx/` (`{id}.ogg` / `.mp3`); list each file here with author, URL, and license (prefer CC0).

## Future third-party packs

When adding Kenney / OpenGameArt / other packs, list each file here with:

- Author
- URL
- License (prefer CC0)
- Path in repo

Do **not** include third-party proprietary casino IP or trademarked game assets.
