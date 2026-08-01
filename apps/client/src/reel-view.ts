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
  private chromeOuter: Graphics | null = null;
  private chromeInner: Graphics | null = null;
  private fxLayer = new Container();
  private multLayer = new Container();
  private pillText: Text | null = null;
  /** Optional hooks for SFX (set by main). */
  onReelStop: ((reelIndex: number) => void) | null = null;
  onSpinStart: (() => void) | null = null;
  onSpinEnd: (() => void) | null = null;
  onAnticipation: (() => void) | null = null;
  onNearMiss: (() => void) | null = null;

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

    // Layer order: bg → outer chrome → frame art → board reels → inner chrome → title
    this.chromeOuter = new Graphics();
    this.chromeInner = new Graphics();
    this.stageRoot.addChild(this.chromeOuter);

    this.frameSprite = new Sprite(frameTex());
    this.frameSprite.anchor.set(0.5);
    this.frameSprite.alpha = 0.38;
    this.stageRoot.addChild(this.frameSprite);

    this.stageRoot.addChild(this.board);
    this.stageRoot.addChild(this.chromeInner);

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
    this.board.addChild(this.fxLayer);
    this.board.addChild(this.multLayer);

    this.pillText = new Text({
      text: '',
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: 16,
        fill: 0xfff2c4,
        fontWeight: '700',
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.8 },
      },
    });
    this.pillText.anchor.set(0.5);
    this.pillText.visible = false;
    this.stageRoot.addChild(this.pillText);

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
      this.frameSprite.y = cy + 8;
      const fs = Math.min(
        (boardW + 220) / this.frameSprite.texture.width,
        (boardH + 260) / this.frameSprite.texture.height,
      );
      this.frameSprite.scale.set(fs * 1.08);
    }

    // Vector chrome “9-slice” feel: thick outer bezel + gold corners + inner rail
    const drawChrome = (g: Graphics | null, inflate: number, fillA: number, strokeA: number) => {
      if (!g) return;
      g.clear();
      const x = cx - boardW / 2 - inflate;
      const y = cy + 8 - boardH / 2 - inflate;
      const ww = boardW + inflate * 2;
      const hh = boardH + inflate * 2;
      g.roundRect(x, y, ww, hh, 22);
      g.fill({ color: 0x1a1008, alpha: fillA });
      g.stroke({ color: 0xc9a227, width: 5, alpha: strokeA });
      g.roundRect(x + 8, y + 8, ww - 16, hh - 16, 16);
      g.stroke({ color: 0x6a4a18, width: 2, alpha: strokeA * 0.9 });
      // Corner studs
      const studs = [
        [x + 18, y + 18],
        [x + ww - 18, y + 18],
        [x + 18, y + hh - 18],
        [x + ww - 18, y + hh - 18],
      ];
      for (const [sx, sy] of studs) {
        g.circle(sx!, sy!, 5);
        g.fill({ color: 0xe8c86a, alpha: 0.9 });
      }
    };
    drawChrome(this.chromeOuter, 36, 0.55, 0.95);
    // Inner chrome is outline-only around board (no fill so reels stay visible)
    if (this.chromeInner) {
      this.chromeInner.clear();
      const x = cx - boardW / 2 - 6;
      const y = cy + 8 - boardH / 2 - 6;
      this.chromeInner.roundRect(x, y, boardW + 12, boardH + 12, 14);
      this.chromeInner.stroke({ color: 0xffe08a, width: 1.5, alpha: 0.55 });
    }

    if (this.titleText) {
      this.titleText.x = cx;
      this.titleText.y = Math.max(28, cy - boardH / 2 - 56);
      this.titleText.style.fontSize = Math.min(48, w / 18);
    }
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
   * Sequential reel stops with optional anticipation / near-miss filler (presentation only).
   * Final window always matches server `grid`.
   */
  async animateSpin(
    grid: SymbolId[][],
    heights: number[],
    opts?: {
      anticipationReels?: number[];
      nearMissScatter?: boolean;
    },
  ): Promise<void> {
    if (this.spinning) return;
    this.spinning = true;
    this.resetPresentation();
    this.onSpinStart?.();

    if (heights.join(',') !== this.heights.join(',')) {
      this.layoutBoard(heights, grid);
    }

    const antic = new Set(opts?.anticipationReels ?? []);
    if (antic.size) this.onAnticipation?.();

    // Start all strips spinning in place (filler loops) then stop sequentially
    for (let r = 0; r < 5; r++) {
      this.prepareStrip(
        r,
        grid[r]!,
        antic.has(r) && !!opts?.nearMissScatter,
      );
    }

    for (let r = 0; r < 5; r++) {
      const isAntic = antic.has(r);
      const duration = isAntic ? 2600 + r * 120 : 900 + r * 160;
      await this.stopReel(r, grid[r]!, duration, isAntic);
      this.onReelStop?.(r);
      if (isAntic && opts?.nearMissScatter) {
        // After anticipation land without 3rd scatter on this reel
        const hasSc = grid[r]!.some(
          (s) => s === 'SCATTER' || s === 'SUPERCOIN',
        );
        if (!hasSc) this.onNearMiss?.();
      }
      await sleep(isAntic ? 120 : 70);
    }

    this.setGrid(grid, heights);
    this.onSpinEnd?.();
    this.spinning = false;
  }

  private prepareStrip(
    reelIndex: number,
    finalSymbols: SymbolId[],
    nearMissScatter: boolean,
  ) {
    const reel = this.reels[reelIndex]!;
    const H = reel.height;
    reel.strip.removeChildren();
    reel.cells = [];
    reel.frames = [];

    const stripSyms: SymbolId[] = [];
    for (let i = 0; i < SPIN_FILLER; i++) {
      stripSyms.push(randomSymbolId());
    }
    // Near-miss: put scatters just above final window in filler
    if (nearMissScatter) {
      stripSyms[SPIN_FILLER - 2] = 'SCATTER' as SymbolId;
      stripSyms[SPIN_FILLER - 1] = 'SCATTER' as SymbolId;
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
    reel.strip.y = 0;
  }

  private async stopReel(
    reelIndex: number,
    finalSymbols: SymbolId[],
    duration: number,
    anticipation: boolean,
  ) {
    const reel = this.reels[reelIndex]!;
    const blur = new BlurFilter({ strength: 0, quality: 3 });
    reel.strip.filters = [blur];
    const travel = SPIN_FILLER * CELL_H;
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        // Anticipation: stay fast longer, then deep ease-out
        const p = anticipation
          ? t < 0.55
            ? t * 0.75
            : 0.75 * 0.55 + easeOutCubic((t - 0.55) / 0.45) * 0.25
          : easeOutCubic(t);
        // Normalize p to 0..1 for full travel
        const pNorm = anticipation
          ? Math.min(1, t < 0.55 ? (t / 0.55) * 0.35 : 0.35 + easeOutCubic((t - 0.55) / 0.45) * 0.65)
          : easeOutCubic(t);
        const bounce =
          t > 0.88
            ? Math.sin(((t - 0.88) / 0.12) * Math.PI) * (CELL_H * 0.14) * (1 - t)
            : 0;
        reel.strip.y = -(travel * pNorm) + bounce;
        blur.strength = anticipation
          ? t < 0.85
            ? 6.5
            : 6.5 * (1 - (t - 0.85) / 0.15)
          : t < 0.72
            ? 5.5 * Math.sin((t / 0.72) * Math.PI)
            : 0;
        void p;
        if (t < 1) requestAnimationFrame(tick);
        else {
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

  // --- Presentation FX API ---

  resetPresentation() {
    this.clearWinGlow();
    this.multLayer.removeChildren();
    this.fxLayer.removeChildren();
    this.hideWinPill();
    for (const reel of this.reels) {
      for (const spr of reel.cells) {
        spr.alpha = 1;
        spr.tint = 0xffffff;
        spr.scale.set(1);
      }
    }
  }

  dimExcept(cells: { reel: number; row: number }[]) {
    const keep = new Set(cells.map((c) => `${c.reel},${c.row}`));
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r]!;
      for (let row = 0; row < reel.cells.length; row++) {
        const spr = reel.cells[row]!;
        if (keep.has(`${r},${row}`)) {
          spr.alpha = 1;
          spr.tint = 0xffffff;
        } else {
          spr.alpha = 0.35;
          spr.tint = 0x888888;
        }
      }
    }
  }

  async playWildLand(
    wildMults: Array<{ reel: number; row: number; mult: number }>,
    ms = 900,
  ): Promise<void> {
    this.multLayer.removeChildren();
    for (const w of wildMults) {
      const spr = this.reels[w.reel]?.cells[w.row];
      if (!spr) continue;
      // Glow ring
      const g = new Graphics();
      const reel = this.reels[w.reel]!;
      const gx = reel.root.x + CELL_W / 2;
      const gy = reel.root.y + w.row * CELL_H + CELL_H / 2;
      g.roundRect(gx - CELL_W / 2 + 2, gy - CELL_H / 2 + 2, CELL_W - 4, CELL_H - 4, 10);
      g.stroke({ color: 0xffe080, width: 3, alpha: 0.95 });
      this.fxLayer.addChild(g);

      const label = new Text({
        text: `×${w.mult}`,
        style: {
          fontFamily: 'Bebas Neue, Impact, sans-serif',
          fontSize: 36,
          fill: 0xfff3a0,
          dropShadow: { color: 0x000000, blur: 6, distance: 2, alpha: 0.9 },
        },
      });
      label.anchor.set(0.5);
      label.x = gx;
      label.y = gy;
      this.multLayer.addChild(label);

      spr.tint = 0xfff0c0;
      // pop
      const start = performance.now();
      const anim = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const s = 1 + 0.2 * Math.sin(t * Math.PI);
        label.scale.set(s);
        spr.scale.set(1 + 0.08 * Math.sin(t * Math.PI));
        g.alpha = 0.4 + 0.6 * Math.sin(t * Math.PI);
        if (t < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
    await sleep(ms);
  }

  async playWinCells(
    cells: { reel: number; row: number }[],
    ms = 700,
  ): Promise<void> {
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 3);
        this.fxLayer.removeChildren();
        for (const c of cells) {
          const reel = this.reels[c.reel];
          if (!reel) continue;
          const spr = reel.cells[c.row];
          if (spr) {
            spr.alpha = 1;
            spr.tint = 0xffffff;
            spr.scale.set(1 + 0.1 * Math.sin(t * Math.PI * 2));
          }
          const g = new Graphics();
          const gx = reel.root.x;
          const gy = reel.root.y + c.row * CELL_H;
          g.roundRect(gx + 1, gy + 1, CELL_W - 2, CELL_H - 2, 10);
          g.stroke({ color: 0xffd24a, width: 3, alpha: pulse });
          this.fxLayer.addChild(g);
        }
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  highlightWins(wins: Array<{ symbol: string }>) {
    if (!wins.length) return;
    const want = new Set(wins.map((w) => w.symbol));
    const cells: { reel: number; row: number }[] = [];
    for (let r = 0; r < this.reels.length; r++) {
      for (let row = 0; row < this.reels[r]!.cells.length; row++) {
        const id = (this.reels[r]!.cells[row] as Sprite & { symbolId?: string })
          .symbolId;
        if (id && want.has(id)) cells.push({ reel: r, row });
      }
    }
    void this.playWinCells(cells, 600);
    this.pulseBoard(10);
  }

  showWinPill(text: string) {
    if (!this.pillText) return;
    this.pillText.text = text;
    this.pillText.visible = true;
    this.pillText.x = this.app.screen.width / 2;
    this.pillText.y = this.board.y - (Math.max(...this.heights) * CELL_H) / 2 - 28;
  }

  hideWinPill() {
    if (this.pillText) this.pillText.visible = false;
  }

  pulseBoard(pulses = 12) {
    if (!this.winGlow) return;
    const maxRows = Math.max(...this.heights);
    const boardW = 5 * CELL_W + 4 * REEL_GAP;
    const boardH = maxRows * CELL_H;
    const originX = -boardW / 2;
    const originY = -boardH / 2;
    let pulse = 0;
    const g = this.winGlow;
    const iv = window.setInterval(() => {
      pulse++;
      g.clear();
      const a = 0.4 + 0.4 * Math.sin(pulse * 0.55);
      g.roundRect(originX - 22, originY - 22, boardW + 44, boardH + 44, 20);
      g.stroke({ color: 0xffd24a, width: 4, alpha: a });
      if (pulse > pulses) {
        clearInterval(iv);
        g.clear();
      }
    }, 55);
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
