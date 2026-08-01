import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  BlurFilter,
} from 'pixi.js';
import type { SymbolId } from '@ws/shared';
import {
  bgTex,
  frameTex,
  loadGameAssets,
  randomSymbolId,
  tex,
} from './assets';

/** Cell size inside each reel window. */
const CELL_W = 118;
const CELL_H = 96;
const REEL_GAP = 8;
const PAD = 4;

/** Extra symbols above the final stop window for the spin strip. */
const SPIN_FILLER = 28;

type ReelState = {
  root: Container;
  mask: Graphics;
  strip: Container;
  cells: Sprite[];
  frames: Graphics[];
  height: number;
  baseY: number;
  x: number;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export class ReelView {
  app: Application;
  private stageRoot = new Container();
  private board = new Container();
  private bgSprite: Sprite | null = null;
  private frameSprite: Sprite | null = null;
  private reels: ReelState[] = [];
  private heights = [4, 6, 6, 6, 4];
  private spinning = false;
  private readyPromise: Promise<void>;
  private winGlow: Graphics | null = null;
  private titleText: Text | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new Application();
    this.readyPromise = this.init(canvas);
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  private async init(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      background: '#0a0705',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: canvas.parentElement ?? undefined,
    });

    await loadGameAssets();

    this.app.stage.addChild(this.stageRoot);

    // Full-bleed background
    this.bgSprite = new Sprite(bgTex());
    this.bgSprite.anchor.set(0.5);
    this.stageRoot.addChild(this.bgSprite);

    // Dim vignette
    const vignette = new Graphics();
    this.stageRoot.addChild(vignette);
    this.stageRoot.addChild(this.board);

    // Cabinet frame overlay (decorative)
    this.frameSprite = new Sprite(frameTex());
    this.frameSprite.anchor.set(0.5);
    this.frameSprite.alpha = 0.92;
    this.stageRoot.addChild(this.frameSprite);

    this.titleText = new Text({
      text: 'WESTERN STAMPEDE',
      style: {
        fontFamily: 'Bebas Neue, Impact, sans-serif',
        fontSize: 42,
        fill: 0xf0c860,
        dropShadow: {
          color: 0x000000,
          blur: 6,
          distance: 3,
          alpha: 0.7,
        },
        letterSpacing: 4,
      },
    });
    this.titleText.anchor.set(0.5);
    this.stageRoot.addChild(this.titleText);

    this.winGlow = new Graphics();
    this.board.addChild(this.winGlow);

    this.layoutBoard(this.heights, emptyGrid(this.heights));
    this.layoutStage();

    window.addEventListener('resize', () => this.layoutStage());
  }

  private layoutStage() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h / 2 + 10;

    if (this.bgSprite) {
      this.bgSprite.x = cx;
      this.bgSprite.y = cy - 20;
      const scale = Math.max(w / this.bgSprite.texture.width, h / this.bgSprite.texture.height) * 1.05;
      this.bgSprite.scale.set(scale);
    }

    const boardW = 5 * CELL_W + 4 * REEL_GAP + 40;
    const boardH = 10 * CELL_H + 40;
    this.board.x = cx;
    this.board.y = cy + 8;

    if (this.frameSprite) {
      this.frameSprite.x = cx;
      this.frameSprite.y = cy;
      const fs = Math.min((boardW + 180) / this.frameSprite.texture.width, (boardH + 220) / this.frameSprite.texture.height);
      this.frameSprite.scale.set(fs * 1.15);
      this.frameSprite.alpha = 0.55;
    }

    if (this.titleText) {
      this.titleText.x = cx;
      this.titleText.y = Math.max(28, cy - boardH / 2 - 48);
      this.titleText.style.fontSize = Math.min(48, w / 18);
    }

    // Darken edges with a simple overlay rect on stage root
    // (kept lightweight — bg provides atmosphere)
    void boardW;
    void boardH;
  }

  layoutBoard(heights: number[], grid: SymbolId[][]) {
    this.heights = [...heights];

    for (const r of this.reels) {
      r.root.destroy({ children: true });
    }
    this.reels = [];

    const maxRows = Math.max(...heights);
    const boardW = 5 * CELL_W + 4 * REEL_GAP;
    const boardH = maxRows * CELL_H;
    const originX = -boardW / 2;
    const originY = -boardH / 2;

    // Board plate behind reels
    let plate = this.board.children.find((c) => c.label === 'plate') as Graphics | undefined;
    if (!plate) {
      plate = new Graphics({ label: 'plate' });
      this.board.addChildAt(plate, 0);
    }
    plate.clear();
    plate.roundRect(originX - 18, originY - 18, boardW + 36, boardH + 36, 18);
    plate.fill({ color: 0x0c0806, alpha: 0.88 });
    plate.stroke({ color: 0xc9a227, width: 3, alpha: 0.85 });
    // Inner gold line
    plate.roundRect(originX - 10, originY - 10, boardW + 20, boardH + 20, 12);
    plate.stroke({ color: 0x6a4a12, width: 1.5, alpha: 0.9 });

    for (let r = 0; r < 5; r++) {
      const height = heights[r]!;
      const reelRoot = new Container();
      const x = originX + r * (CELL_W + REEL_GAP);
      const yOff = ((maxRows - height) * CELL_H) / 2;
      const baseY = originY + yOff;
      reelRoot.x = x;
      reelRoot.y = baseY;

      // Reel well background
      const well = new Graphics();
      well.roundRect(-PAD, -PAD, CELL_W + PAD * 2, height * CELL_H + PAD * 2, 8);
      well.fill(0x120c08);
      well.stroke({ color: 0x3a2a14, width: 2 });
      reelRoot.addChild(well);

      const mask = new Graphics();
      mask.rect(0, 0, CELL_W, height * CELL_H);
      mask.fill(0xffffff);
      reelRoot.addChild(mask);

      const strip = new Container();
      strip.mask = mask;
      reelRoot.addChild(strip);

      // Top/bottom fade bars for depth
      const fadeTop = new Graphics();
      fadeTop.rect(0, 0, CELL_W, 18);
      fadeTop.fill({ color: 0x000000, alpha: 0.55 });
      reelRoot.addChild(fadeTop);
      const fadeBot = new Graphics();
      fadeBot.rect(0, height * CELL_H - 18, CELL_W, 18);
      fadeBot.fill({ color: 0x000000, alpha: 0.55 });
      reelRoot.addChild(fadeBot);

      const cells: Sprite[] = [];
      const frames: Graphics[] = [];
      const symbols = grid[r] ?? emptyCol(height);

      for (let row = 0; row < height; row++) {
        const { sprite, frame } = this.makeCell(symbols[row] ?? 'A', row * CELL_H);
        strip.addChild(frame);
        strip.addChild(sprite);
        cells.push(sprite);
        frames.push(frame);
      }

      this.board.addChild(reelRoot);
      this.reels.push({
        root: reelRoot,
        mask,
        strip,
        cells,
        frames,
        height,
        baseY,
        x,
      });
    }

    if (this.winGlow) {
      this.board.addChild(this.winGlow);
    }
    this.layoutStage();
  }

  private makeCell(sym: SymbolId | string, y: number): { sprite: Sprite; frame: Graphics } {
    const frame = new Graphics();
    frame.roundRect(2, y + 2, CELL_W - 4, CELL_H - 4, 10);
    frame.fill({ color: 0x1a120c, alpha: 0.35 });
    frame.stroke({ color: 0x000000, width: 1, alpha: 0.4 });

    const sprite = new Sprite(tex(sym));
    sprite.width = CELL_W - 10;
    sprite.height = CELL_H - 10;
    sprite.x = 5;
    sprite.y = y + 5;
    sprite.roundPixels = true;
    (sprite as Sprite & { symbolId?: string }).symbolId = String(sym);
    return { sprite, frame };
  }

  setGrid(grid: SymbolId[][], heights?: number[]) {
    if (heights && heights.join(',') !== this.heights.join(',')) {
      this.layoutBoard(heights, grid);
      return;
    }
    for (let r = 0; r < 5; r++) {
      const reel = this.reels[r]!;
      for (let row = 0; row < reel.height; row++) {
        const sym = grid[r]?.[row] ?? 'A';
        const spr = reel.cells[row];
        if (spr) {
          spr.texture = tex(sym);
          spr.width = CELL_W - 10;
          spr.height = CELL_H - 10;
        }
      }
      reel.strip.y = 0;
    }
  }

  /**
   * Real vertical reel spin: long strip scrolls behind a mask, staggered stops, bounce.
   */
  async animateSpin(grid: SymbolId[][], heights: number[]): Promise<void> {
    if (this.spinning) return;
    this.spinning = true;
    this.clearWinGlow();

    if (heights.join(',') !== this.heights.join(',')) {
      this.layoutBoard(heights, grid);
    }

    const jobs: Promise<void>[] = [];
    for (let r = 0; r < 5; r++) {
      jobs.push(this.spinOneReel(r, grid[r]!, r * 140));
    }
    await Promise.all(jobs);
    this.setGrid(grid, heights);
    this.spinning = false;
  }

  private async spinOneReel(reelIndex: number, finalSymbols: SymbolId[], delayMs: number) {
    await sleep(delayMs);
    const reel = this.reels[reelIndex]!;
    const H = reel.height;

    // Build strip: filler + final window symbols
    reel.strip.removeChildren();
    reel.cells = [];
    reel.frames = [];

    const stripSyms: SymbolId[] = [];
    for (let i = 0; i < SPIN_FILLER; i++) {
      stripSyms.push(randomSymbolId());
    }
    for (let row = 0; row < H; row++) {
      stripSyms.push(finalSymbols[row]!);
    }

    for (let i = 0; i < stripSyms.length; i++) {
      const { sprite, frame } = this.makeCell(stripSyms[i]!, i * CELL_H);
      reel.strip.addChild(frame);
      reel.strip.addChild(sprite);
      reel.cells.push(sprite);
      reel.frames.push(frame);
    }

    // Start showing top of filler
    reel.strip.y = 0;

    // Motion blur while spinning hard
    const blur = new BlurFilter({ strength: 0, quality: 3 });
    reel.strip.filters = [blur];

    const travel = SPIN_FILLER * CELL_H;
    const duration = 1200 + reelIndex * 110;
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        const t = Math.min(1, (now - start) / duration);
        // Ease-out travel with small settle bounce near the end
        const p = easeOutCubic(t);
        const bounce =
          t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * (CELL_H * 0.12) * (1 - t) : 0;
        reel.strip.y = -(travel * p) + bounce;

        // Motion blur strongest mid-spin, clear for stop
        const blurAmt = t < 0.72 ? 5.5 * Math.sin((t / 0.72) * Math.PI) : 0;
        blur.strength = blurAmt;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          reel.strip.y = -travel;
          reel.strip.filters = [];
          this.finalizeReelStrip(reel, finalSymbols);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private finalizeReelStrip(reel: ReelState, finalSymbols: SymbolId[]) {
    reel.strip.removeChildren();
    reel.cells = [];
    reel.frames = [];
    for (let row = 0; row < reel.height; row++) {
      const { sprite, frame } = this.makeCell(finalSymbols[row]!, row * CELL_H);
      reel.strip.addChild(frame);
      reel.strip.addChild(sprite);
      reel.cells.push(sprite);
      reel.frames.push(frame);
    }
    reel.strip.y = 0;
  }

  highlightWins(wins: Array<{ symbol: string }>) {
    if (!wins.length || !this.winGlow) return;
    const want = new Set(wins.map((w) => w.symbol));
    this.winGlow.clear();

    const maxRows = Math.max(...this.heights);
    const boardW = 5 * CELL_W + 4 * REEL_GAP;
    const boardH = maxRows * CELL_H;
    const originX = -boardW / 2;
    const originY = -boardH / 2;

    // Pulse board frame
    let pulse = 0;
    const g = this.winGlow;
    const iv = window.setInterval(() => {
      pulse++;
      g.clear();
      const a = 0.4 + 0.4 * Math.sin(pulse * 0.55);
      g.roundRect(originX - 22, originY - 22, boardW + 44, boardH + 44, 20);
      g.stroke({ color: 0xffd24a, width: 4, alpha: a });
      if (pulse > 14) {
        clearInterval(iv);
        g.clear();
      }
    }, 55);

    // Pop winning symbols
    for (const reel of this.reels) {
      for (const spr of reel.cells) {
        const id = (spr as Sprite & { symbolId?: string }).symbolId;
        if (!id || !want.has(id)) continue;
        const ox = spr.x;
        const oy = spr.y;
        const ow = spr.width;
        const oh = spr.height;
        spr.anchor.set(0.5);
        spr.x = ox + ow / 2;
        spr.y = oy + oh / 2;
        spr.width = ow;
        spr.height = oh;
        const start = performance.now();
        const anim = () => {
          const t = Math.min(1, (performance.now() - start) / 420);
          const s = 1 + 0.12 * Math.sin(t * Math.PI);
          spr.scale.set(s);
          if (t < 1) requestAnimationFrame(anim);
          else spr.scale.set(1);
        };
        requestAnimationFrame(anim);
      }
    }
  }

  private clearWinGlow() {
    this.winGlow?.clear();
  }
}

function emptyCol(h: number): SymbolId[] {
  return Array.from({ length: h }, () => 'LONGHORN' as SymbolId);
}

function emptyGrid(heights: number[]): SymbolId[][] {
  return heights.map((h) => emptyCol(h));
}
