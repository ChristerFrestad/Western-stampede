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
  tex,
} from './assets';
import { buildSpinCadence } from './presentation/spin-timing';
import { buildSpinFiller, nextSpinSymbol } from './presentation/spin-strip';
import {
  CELL_W,
  CELL_H,
  CELL_PAD,
  REEL_GAP,
  REEL_PAD,
  coverFit,
  isPremiumSymbol,
} from './presentation/symbol-fit.js';

const PAD = REEL_PAD;

/** Extra symbols above the final stop window for the spin strip. */
const SPIN_FILLER = 40;

type ReelState = {
  root: Container;
  mask: Graphics;
  strip: Container;
  cells: Sprite[];
  frames: Graphics[];
  height: number;
  baseY: number;
  x: number;
  /** Continuous spin offset while waiting to stop. */
  spinOffset: number;
  spinning: boolean;
  blur: BlurFilter | null;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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
  onReelStop: ((reelIndex: number, symbols: SymbolId[]) => void) | null = null;
  onSpinStart: (() => void) | null = null;
  onSpinEnd: (() => void) | null = null;
  /** Fired when first anticipation reel begins stopping. */
  onAnticipation: (() => void) | null = null;
  onAnticipationEnd: (() => void) | null = null;
  onNearMiss: (() => void) | null = null;
  private anticipGraphics: Graphics | null = null;
  private anticipActive = false;

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
        const { sprite, frame, wrap } = this.makeCell(
          symbols[row] ?? 'A',
          row * CELL_H,
        );
        strip.addChild(frame);
        strip.addChild(wrap);
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
        spinOffset: 0,
        spinning: false,
        blur: null,
      });
    }

    if (this.winGlow) {
      this.board.addChild(this.winGlow);
    }
    this.layoutStage();
  }

  /**
   * Cover-fit: uniform scale, center, fill cell (no stretch).
   * Cropping handled by per-cell rounded mask on the strip container.
   */
  private layoutSprite(sprite: Sprite, rowY: number, sym: SymbolId | string) {
    const texture = tex(sym);
    sprite.texture = texture;
    sprite.anchor.set(0);
    const tw = texture.width || 1;
    const th = texture.height || 1;
    const fit = coverFit(tw, th);
    sprite.scale.set(fit.scale);
    sprite.x = fit.x;
    sprite.y = rowY + fit.y;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    sprite.roundPixels = true;
    (sprite as Sprite & { symbolId?: string }).symbolId = String(sym);
  }

  private makeCell(
    sym: SymbolId | string,
    y: number,
  ): { sprite: Sprite; frame: Graphics; wrap: Container } {
    const frame = new Graphics();
    const premium = isPremiumSymbol(String(sym));
    frame.roundRect(2, y + 2, CELL_W - 4, CELL_H - 4, 10);
    frame.fill({ color: premium ? 0x1a1408 : 0x1a120c, alpha: premium ? 0.45 : 0.35 });
    frame.stroke({
      color: premium ? 0xc9a227 : 0x000000,
      width: premium ? 2 : 1,
      alpha: premium ? 0.75 : 0.4,
    });

    // Clip sprite to rounded cell (cover may overflow)
    const mask = new Graphics();
    mask.roundRect(CELL_PAD, y + CELL_PAD, CELL_W - CELL_PAD * 2, CELL_H - CELL_PAD * 2, 8);
    mask.fill(0xffffff);

    const sprite = new Sprite(tex(sym));
    this.layoutSprite(sprite, y, sym);
    sprite.mask = mask;

    const wrap = new Container();
    wrap.addChild(mask);
    wrap.addChild(sprite);

    return { sprite, frame, wrap };
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
        if (spr) this.layoutSprite(spr, row * CELL_H, sym);
      }
      reel.strip.y = 0;
      reel.spinOffset = 0;
      reel.spinning = false;
    }
  }

  /**
   * All reels spin together, then stop left→right (Vegas style).
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
    let anticipStarted = false;

    // 1) Build strips and start ALL reels spinning in parallel
    for (let r = 0; r < 5; r++) {
      this.prepareStrip(r, grid[r]!, antic.has(r) && !!opts?.nearMissScatter);
      this.startContinuousSpin(r);
    }

    const cadence = buildSpinCadence({
      anticipationReels: opts?.anticipationReels,
    });

    // 2) Minimum simultaneous spin so all reels are visibly moving
    await sleep(cadence.minSimultaneousMs);

    // 3) Stop one by one (others keep spinning until their turn)
    for (let i = 0; i < cadence.stopOrder.length; i++) {
      const r = cadence.stopOrder[i]!;
      const isAntic = antic.has(r);
      if (isAntic && !anticipStarted) {
        anticipStarted = true;
        this.startAnticipationBoots(antic);
        this.onAnticipation?.();
      }
      await this.stopReel(r, grid[r]!, cadence.stopDurationMs[i]!, isAntic);
      this.onReelStop?.(r, grid[r]!);
      if (isAntic && opts?.nearMissScatter) {
        const hasSc = grid[r]!.some((s) => s === 'SCATTER' || s === 'SUPERCOIN');
        if (!hasSc) this.onNearMiss?.();
      }
      await sleep(cadence.gapAfterStopMs[i]!);
    }

    this.stopAnticipationBoots();
    if (anticipStarted) this.onAnticipationEnd?.();
    this.setGrid(grid, heights);
    this.onSpinEnd?.();
    this.spinning = false;
  }

  /** Visual anticipation boots: dim board, glow pending reels, scatter progress. */
  private startAnticipationBoots(anticReels: Set<number>) {
    this.anticipActive = true;
    if (!this.anticipGraphics) {
      this.anticipGraphics = new Graphics();
      this.board.addChild(this.anticipGraphics);
    }
    const g = this.anticipGraphics;
    const maxRows = Math.max(...this.heights);
    const boardW = 5 * CELL_W + 4 * REEL_GAP;
    const boardH = maxRows * CELL_H;
    const originX = -boardW / 2;
    const originY = -boardH / 2;

    // Dim non-antic reels harder for casino tension
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r]!;
      if (!anticReels.has(r) && reel.spinning) {
        reel.root.alpha = 0.38;
      } else if (anticReels.has(r)) {
        reel.root.alpha = 1;
      }
    }

    // Locked scatters on already-stopped reels
    let lockedScatters = 0;
    for (let r = 0; r < this.reels.length; r++) {
      if (anticReels.has(r)) continue;
      const reel = this.reels[r]!;
      if (reel.spinning) continue;
      for (const spr of reel.cells) {
        const id = (spr as Sprite & { symbolId?: string }).symbolId;
        if (id === 'SCATTER' || id === 'SUPERCOIN') lockedScatters++;
      }
    }

    if (!this.pillText) {
      /* title area used for scatter progress */
    }
    if (this.pillText) {
      this.pillText.visible = true;
      this.pillText.text = `SCATTER ${Math.min(2, lockedScatters)}/3 — FREE GAMES?`;
      this.pillText.style.fill = 0xffd24a;
    }

    const draw = () => {
      if (!this.anticipActive || !this.anticipGraphics) return;
      const pulse = 0.45 + 0.55 * Math.sin(performance.now() / 160);
      g.clear();
      // Hot orange vignette
      g.roundRect(originX - 32, originY - 32, boardW + 64, boardH + 64, 24);
      g.stroke({ color: 0xff6a2a, width: 4, alpha: 0.3 + pulse * 0.4 });
      g.roundRect(originX - 20, originY - 20, boardW + 40, boardH + 40, 18);
      g.stroke({ color: 0xffc14a, width: 2, alpha: 0.2 + pulse * 0.25 });
      for (const r of anticReels) {
        const reel = this.reels[r];
        if (!reel) continue;
        g.roundRect(
          reel.x - 6,
          reel.baseY - 6,
          CELL_W + 12,
          reel.height * CELL_H + 12,
          12,
        );
        g.stroke({ color: 0xffc14a, width: 4, alpha: pulse });
        // Inner heat
        g.roundRect(
          reel.x,
          reel.baseY,
          CELL_W,
          reel.height * CELL_H,
          8,
        );
        g.fill({ color: 0xff8a20, alpha: 0.06 + pulse * 0.06 });
      }
      // Progress pips under board
      for (let i = 0; i < 3; i++) {
        const px = originX + boardW / 2 - 36 + i * 36;
        const py = originY + boardH + 22;
        g.circle(px, py, 8);
        g.fill({
          color: i < lockedScatters ? 0xffd24a : 0x3a2a18,
          alpha: i < lockedScatters ? 0.95 : 0.55,
        });
        g.circle(px, py, 8);
        g.stroke({ color: 0xe8b84a, width: 1.5, alpha: 0.8 });
      }
      this.board.scale.set(1 + 0.012 * pulse);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  private stopAnticipationBoots() {
    this.anticipActive = false;
    this.board.scale.set(1);
    this.anticipGraphics?.clear();
    for (const reel of this.reels) {
      reel.root.alpha = 1;
    }
    if (this.pillText) {
      this.pillText.visible = false;
      this.pillText.text = '';
    }
  }

  /**
   * Stampede: board height expands to tall grid with gold shockwave.
   * Call after layoutBoard already updated heights, or pass new heights/grid.
   */
  async playStampedeExpand(
    heights: number[],
    grid: SymbolId[][],
    ms = 900,
  ): Promise<void> {
    this.layoutBoard(heights, grid);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const ease = 1 - Math.pow(1 - t, 3);
        const pulse = Math.sin(t * Math.PI);
        this.fxLayer.removeChildren();
        const maxRows = Math.max(...this.heights);
        const boardW = 5 * CELL_W + 4 * REEL_GAP;
        const boardH = maxRows * CELL_H;
        const g = new Graphics();
        const inflate = 20 + ease * 40;
        g.roundRect(
          -boardW / 2 - inflate,
          -boardH / 2 - inflate,
          boardW + inflate * 2,
          boardH + inflate * 2,
          20,
        );
        g.stroke({
          color: 0xffe08a,
          width: 5,
          alpha: 0.9 * (1 - t * 0.5),
        });
        g.roundRect(
          -boardW / 2 - 8,
          -boardH / 2 - 8,
          boardW + 16,
          boardH + 16,
          14,
        );
        g.stroke({ color: 0xc9a227, width: 2, alpha: 0.5 + pulse * 0.4 });
        this.fxLayer.addChild(g);
        this.board.scale.set(0.92 + ease * 0.1);
        if (t < 1) requestAnimationFrame(tick);
        else {
          this.board.scale.set(1);
          this.fxLayer.removeChildren();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    await this.pulseLonghorns(Math.min(1200, ms));
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

    // Mixed weighted filler (anti-run) — never 9999…JJJJ blocks
    const stripSyms: SymbolId[] = buildSpinFiller(SPIN_FILLER, { maxRun: 2 });
    if (nearMissScatter) {
      stripSyms[SPIN_FILLER - 2] = 'SCATTER' as SymbolId;
      stripSyms[SPIN_FILLER - 1] = 'SCATTER' as SymbolId;
    }
    for (let row = 0; row < H; row++) {
      stripSyms.push(finalSymbols[row]!);
    }

    for (let i = 0; i < stripSyms.length; i++) {
      const { sprite, frame, wrap } = this.makeCell(stripSyms[i]!, i * CELL_H);
      reel.strip.addChild(frame);
      reel.strip.addChild(wrap);
      reel.cells.push(sprite);
      reel.frames.push(frame);
    }
    // Per-reel phase so reels don't scroll in lockstep
    reel.spinOffset = Math.floor(Math.random() * SPIN_FILLER) * CELL_H * 0.37;
    reel.strip.y = -reel.spinOffset;
  }

  private startContinuousSpin(reelIndex: number) {
    const reel = this.reels[reelIndex]!;
    reel.spinning = true;
    if (!reel.blur) {
      reel.blur = new BlurFilter({ strength: 4, quality: 2 });
    }
    reel.blur.strength = 4.5;
    reel.strip.filters = [reel.blur];

    const loopLen = SPIN_FILLER * CELL_H;
    // Slight speed variance per reel so motion desyncs
    const speed = 38 + reelIndex * 3 + Math.random() * 4;

    let last = performance.now();
    let lastCell = Math.floor(reel.spinOffset / CELL_H);
    const tick = () => {
      if (!reel.spinning) return;
      const now = performance.now();
      const dt = Math.min(32, now - last);
      last = now;
      const prev = reel.spinOffset;
      reel.spinOffset = (reel.spinOffset + speed * (dt / 16)) % loopLen;
      // Full wrap → re-roll entire filler so pattern never repeats
      if (reel.spinOffset < prev) {
        this.rerollFillerSymbols(reel);
        lastCell = Math.floor(reel.spinOffset / CELL_H);
      } else {
        // Cell boundary crossed → re-roll the cell that just went off-screen
        const cell = Math.floor(reel.spinOffset / CELL_H);
        if (cell !== lastCell) {
          const left = (lastCell + SPIN_FILLER) % SPIN_FILLER;
          // Re-randomize the strip index that left the top of the window
          this.rerollFillerCell(reel, left);
          lastCell = cell;
        }
      }
      reel.strip.y = -reel.spinOffset;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Re-mix all filler cells (indices 0..SPIN_FILLER-1); keep final window intact. */
  private rerollFillerSymbols(reel: ReelState) {
    const fresh = buildSpinFiller(SPIN_FILLER, { maxRun: 2 });
    for (let i = 0; i < SPIN_FILLER; i++) {
      const spr = reel.cells[i];
      if (!spr) continue;
      this.layoutSprite(spr, i * CELL_H, fresh[i]!);
    }
  }

  private rerollFillerCell(reel: ReelState, index: number) {
    if (index < 0 || index >= SPIN_FILLER) return;
    const spr = reel.cells[index];
    if (!spr) return;
    const prevId = (spr as Sprite & { symbolId?: string }).symbolId ?? null;
    const next = nextSpinSymbol(prevId as SymbolId | null, { maxRun: 2 });
    this.layoutSprite(spr, index * CELL_H, next);
  }

  private async stopReel(
    reelIndex: number,
    finalSymbols: SymbolId[],
    duration: number,
    anticipation: boolean,
  ) {
    const reel = this.reels[reelIndex]!;
    // Halt continuous spin; keep current offset as start of ease
    reel.spinning = false;
    const startY = reel.strip.y;
    const targetY = -(SPIN_FILLER * CELL_H);
    const start = performance.now();
    const blur = reel.blur ?? new BlurFilter({ strength: 4, quality: 2 });
    reel.strip.filters = [blur];

    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        const pNorm = anticipation
          ? Math.min(
              1,
              t < 0.5
                ? (t / 0.5) * 0.25
                : 0.25 + easeOutCubic((t - 0.5) / 0.5) * 0.75,
            )
          : easeOutCubic(t);
        const bounce =
          t > 0.9
            ? Math.sin(((t - 0.9) / 0.1) * Math.PI) * (CELL_H * 0.1) * (1 - t)
            : 0;
        reel.strip.y = startY + (targetY - startY) * pNorm + bounce;
        blur.strength = anticipation
          ? t < 0.85
            ? 5
            : 5 * (1 - (t - 0.85) / 0.15)
          : 4.5 * (1 - t);
        if (t < 1) requestAnimationFrame(tick);
        else {
          reel.strip.y = targetY;
          reel.strip.filters = [];
          reel.blur = null;
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
      const { sprite, frame, wrap } = this.makeCell(
        finalSymbols[row]!,
        row * CELL_H,
      );
      reel.strip.addChild(frame);
      reel.strip.addChild(wrap);
      reel.cells.push(sprite);
      reel.frames.push(frame);
    }
    reel.strip.y = 0;
    reel.spinOffset = 0;
    reel.spinning = false;
  }

  // --- Presentation FX API ---

  resetPresentation() {
    this.stopAnticipationBoots();
    this.clearWinGlow();
    this.multLayer.removeChildren();
    this.fxLayer.removeChildren();
    this.hideWinPill();
    for (const reel of this.reels) {
      for (let row = 0; row < reel.cells.length; row++) {
        const spr = reel.cells[row]!;
        const id = (spr as Sprite & { symbolId?: string }).symbolId ?? 'A';
        this.layoutSprite(spr, row * CELL_H, id);
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

  /**
   * Wild reveal: flash + expanding ring from the wild art, then mult badge.
   * Geometry stays layoutSprite-stable (no corner-zoom scale on the symbol).
   */
  async playWildLand(
    wildMults: Array<{ reel: number; row: number; mult: number }>,
    ms = 900,
  ): Promise<void> {
    this.multLayer.removeChildren();
    this.fxLayer.removeChildren();
    if (!wildMults.length) return;

    const revealMs = Math.min(ms * 0.55, 520);
    const badgeMs = Math.max(280, ms - revealMs);

    // Phase 1 — extend/reveal from symbol
    const startReveal = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - startReveal) / revealMs);
        const ease = 1 - Math.pow(1 - t, 3);
        this.fxLayer.removeChildren();
        for (const w of wildMults) {
          const spr = this.reels[w.reel]?.cells[w.row];
          const reel = this.reels[w.reel];
          if (!spr || !reel) continue;
          this.layoutSprite(
            spr,
            w.row * CELL_H,
            (spr as Sprite & { symbolId?: string }).symbolId ?? 'WILD',
          );
          // Flash white → gold (extension of the given wild image)
          const flash = t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.65);
          spr.alpha = 1;
          spr.tint = flash > 0.2 ? 0xffffff : 0xfff0c0;

          const gx = reel.root.x + CELL_W / 2;
          const gy = reel.root.y + w.row * CELL_H + CELL_H / 2;
          const ring = new Graphics();
          const rad = (Math.min(CELL_W, CELL_H) / 2) * (0.4 + ease * 0.9);
          ring.circle(gx, gy, rad);
          ring.stroke({ color: 0xffe080, width: 3 + ease * 4, alpha: 0.95 * (1 - t * 0.35) });
          ring.circle(gx, gy, rad * 0.55);
          ring.stroke({ color: 0xfff6c8, width: 2, alpha: 0.5 * (1 - t) });
          this.fxLayer.addChild(ring);

          // Soft rays (8 lines) as “extension” of the art
          const rays = new Graphics();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + t * 0.8;
            const len = rad * (0.9 + 0.35 * Math.sin(t * Math.PI + i));
            rays.moveTo(gx, gy);
            rays.lineTo(gx + Math.cos(a) * len, gy + Math.sin(a) * len);
          }
          rays.stroke({ color: 0xffd24a, width: 2, alpha: 0.35 + 0.4 * (1 - t) });
          this.fxLayer.addChild(rays);
        }
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    // Phase 2 — mult badges bounce in; keep gold frames
    this.fxLayer.removeChildren();
    for (const w of wildMults) {
      const spr = this.reels[w.reel]?.cells[w.row];
      const reel = this.reels[w.reel];
      if (!spr || !reel) continue;
      spr.tint = 0xfff0c0;
      const gx = reel.root.x + CELL_W / 2;
      const gy = reel.root.y + w.row * CELL_H + CELL_H / 2;
      const frame = new Graphics();
      frame.roundRect(gx - CELL_W / 2 + 2, gy - CELL_H / 2 + 2, CELL_W - 4, CELL_H - 4, 10);
      frame.stroke({ color: 0xffe080, width: 3, alpha: 0.95 });
      this.fxLayer.addChild(frame);

      const plate = new Graphics();
      plate.roundRect(gx - 32, gy - 20, 64, 40, 10);
      plate.fill({ color: 0x1a0e04, alpha: 0.9 });
      plate.stroke({ color: 0xffe080, width: 2.5, alpha: 1 });
      this.multLayer.addChild(plate);

      const label = new Text({
        text: `×${w.mult}`,
        style: {
          fontFamily: 'Bebas Neue, Impact, sans-serif',
          fontSize: 34,
          fill: 0xfff3a0,
          dropShadow: { color: 0x000000, blur: 6, distance: 2, alpha: 0.9 },
        },
      });
      label.anchor.set(0.5);
      label.x = gx;
      label.y = gy;
      this.multLayer.addChild(label);

      const start = performance.now();
      const anim = () => {
        const t = Math.min(1, (performance.now() - start) / badgeMs);
        // Bounce-in then gentle pulse
        const pop = t < 0.35 ? easeOutBack(t / 0.35) : 1 + 0.12 * Math.sin((t - 0.35) * Math.PI * 2);
        label.scale.set(pop);
        frame.alpha = 0.55 + 0.45 * Math.sin(t * Math.PI);
        if (t < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
    await sleep(badgeMs);
  }

  /** Keep mult badges on wild cells that participate in the current win. */
  showWildBadges(wildMults: Array<{ reel: number; row: number; mult: number }>) {
    this.multLayer.removeChildren();
    for (const w of wildMults) {
      const reel = this.reels[w.reel];
      if (!reel) continue;
      const gx = reel.root.x + CELL_W / 2;
      const gy = reel.root.y + w.row * CELL_H + CELL_H / 2;

      // Badge plate so ×N is always readable
      const plate = new Graphics();
      plate.roundRect(gx - 28, gy + CELL_H * 0.12, 56, 34, 8);
      plate.fill({ color: 0x1a0e04, alpha: 0.88 });
      plate.stroke({ color: 0xffe080, width: 2, alpha: 0.95 });
      this.multLayer.addChild(plate);

      const label = new Text({
        text: `×${w.mult}`,
        style: {
          fontFamily: 'Bebas Neue, Impact, sans-serif',
          fontSize: 30,
          fill: 0xfff3a0,
          dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.9 },
        },
      });
      label.anchor.set(0.5);
      label.x = gx;
      label.y = gy + CELL_H * 0.3;
      this.multLayer.addChild(label);
    }
  }

  /**
   * Longhorns raining into free-game reels (board choreography after Supercoin).
   * Pure presentation — does not change server state.
   */
  async playLonghornInject(count: number, ms = 1600): Promise<void> {
    const n = Math.min(18, Math.max(4, count));
    this.fxLayer.removeChildren();
    const start = performance.now();
    const flyers: Array<{
      g: Graphics;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      delay: number;
      spr: Sprite | null;
    }> = [];

    for (let i = 0; i < n; i++) {
      const reel = this.reels[i % 5]!;
      const row = Math.min(
        reel.height - 1,
        Math.floor((i / 5) % Math.max(1, reel.height)),
      );
      const x1 = reel.root.x + CELL_W / 2;
      const y1 = reel.root.y + row * CELL_H + CELL_H / 2;
      const x0 = (Math.random() - 0.5) * 5 * CELL_W;
      const y0 = -Math.max(...this.heights) * CELL_H * 0.6 - Math.random() * 80;
      let spr: Sprite | null = null;
      try {
        spr = new Sprite(tex('LONGHORN'));
        const fit = coverFit(spr.texture.width || 1, spr.texture.height || 1);
        spr.anchor.set(0.5);
        spr.scale.set(fit.scale * 0.85);
        spr.alpha = 0.95;
      } catch {
        spr = null;
      }
      flyers.push({
        g: new Graphics(),
        x0,
        y0,
        x1,
        y1,
        delay: (i / n) * 0.45,
        spr,
      });
    }

    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        this.fxLayer.removeChildren();
        // Board gold pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
        const maxRows = Math.max(...this.heights);
        const boardW = 5 * CELL_W + 4 * REEL_GAP;
        const boardH = maxRows * CELL_H;
        const plate = new Graphics();
        plate.roundRect(
          -boardW / 2 - 12,
          -boardH / 2 - 12,
          boardW + 24,
          boardH + 24,
          16,
        );
        plate.stroke({ color: 0xe8b84a, width: 3, alpha: 0.35 + pulse * 0.4 });
        this.fxLayer.addChild(plate);

        for (const f of flyers) {
          const local = Math.min(1, Math.max(0, (t - f.delay) / (1 - f.delay)));
          if (local <= 0) continue;
          const ease = 1 - Math.pow(1 - local, 2.4);
          const x = f.x0 + (f.x1 - f.x0) * ease;
          const y = f.y0 + (f.y1 - f.y0) * ease;
          if (f.spr) {
            f.spr.x = x;
            f.spr.y = y;
            f.spr.rotation = (1 - ease) * 0.6;
            f.spr.alpha = 0.4 + 0.6 * ease;
            this.fxLayer.addChild(f.spr);
          } else {
            f.g.clear();
            f.g.circle(x, y, 14 + 8 * ease);
            f.g.fill({ color: 0xc9a227, alpha: 0.85 });
            this.fxLayer.addChild(f.g);
          }
          // Landing ring at end
          if (local > 0.85) {
            const ring = new Graphics();
            const a = (local - 0.85) / 0.15;
            ring.circle(f.x1, f.y1, 12 + a * 28);
            ring.stroke({ color: 0xffe08a, width: 3, alpha: 1 - a });
            this.fxLayer.addChild(ring);
          }
        }
        if (t < 1) requestAnimationFrame(tick);
        else {
          this.fxLayer.removeChildren();
          // Final seal glow on all reels
          for (const reel of this.reels) {
            const g = new Graphics();
            g.roundRect(
              reel.root.x - 2,
              reel.root.y - 2,
              CELL_W + 4,
              reel.height * CELL_H + 4,
              10,
            );
            g.stroke({ color: 0xe8b84a, width: 2, alpha: 0.85 });
            this.fxLayer.addChild(g);
          }
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    await sleep(280);
    this.fxLayer.removeChildren();
  }

  /** Alias for inject/callout board API. */
  pulseLonghornCells(ms = 900): Promise<void> {
    return this.pulseLonghorns(ms);
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
          this.drawWinCell(c, pulse);
        }
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * Sequential L→R win reveal: light cells reel-by-reel so the paying
   * composition is obvious, then hold a full pulse.
   */
  async playWinCellsSequential(
    cells: { reel: number; row: number }[],
    opts?: { stepMs?: number; holdMs?: number; shouldAbort?: () => boolean },
  ): Promise<void> {
    const stepMs = opts?.stepMs ?? 140;
    const holdMs = opts?.holdMs ?? 420;
    if (!cells.length) return;

    const byReel = new Map<number, { reel: number; row: number }[]>();
    for (const c of cells) {
      const list = byReel.get(c.reel) ?? [];
      list.push(c);
      byReel.set(c.reel, list);
    }
    const reelOrder = [...byReel.keys()].sort((a, b) => a - b);
    const lit: { reel: number; row: number }[] = [];

    for (const r of reelOrder) {
      if (opts?.shouldAbort?.()) break;
      for (const c of byReel.get(r)!) lit.push(c);
      this.dimExcept(lit);
      this.fxLayer.removeChildren();
      for (const c of lit) this.drawWinCell(c, 1);
      await sleep(stepMs);
    }

    if (opts?.shouldAbort?.()) return;

    const holdStart = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (opts?.shouldAbort?.()) {
          resolve();
          return;
        }
        const t = Math.min(1, (performance.now() - holdStart) / holdMs);
        const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 3);
        this.fxLayer.removeChildren();
        for (const c of lit) this.drawWinCell(c, pulse);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private drawWinCell(c: { reel: number; row: number }, pulse: number) {
    const reel = this.reels[c.reel];
    if (!reel) return;
    const spr = reel.cells[c.row];
    if (spr) {
      spr.alpha = 1;
      spr.tint = pulse > 0.75 ? 0xffffee : 0xffffff;
      this.layoutSprite(
        spr,
        c.row * CELL_H,
        (spr as Sprite & { symbolId?: string }).symbolId ?? 'A',
      );
      spr.tint = pulse > 0.75 ? 0xffffee : 0xffffff;
    }
    const g = new Graphics();
    const gx = reel.root.x;
    const gy = reel.root.y + c.row * CELL_H;
    g.roundRect(gx + 1, gy + 1, CELL_W - 2, CELL_H - 2, 10);
    g.stroke({ color: 0xffd24a, width: 3, alpha: pulse });
    // Corner studs for “this cell pays”
    const stud = 0xffe080;
    for (const [sx, sy] of [
      [gx + 8, gy + 8],
      [gx + CELL_W - 8, gy + 8],
      [gx + 8, gy + CELL_H - 8],
      [gx + CELL_W - 8, gy + CELL_H - 8],
    ] as const) {
      g.circle(sx, sy, 3);
      g.fill({ color: stud, alpha: pulse });
    }
    this.fxLayer.addChild(g);
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

  /** All LONGHORN cells currently on the visible grid. */
  longhornCells(): { reel: number; row: number }[] {
    const out: { reel: number; row: number }[] = [];
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r]!;
      for (let row = 0; row < reel.cells.length; row++) {
        const id = (reel.cells[row] as Sprite & { symbolId?: string }).symbolId;
        if (id === 'LONGHORN') out.push({ reel: r, row });
      }
    }
    return out;
  }

  /**
   * Spotlight every Longhorn on the board — used after Supercoin inject
   * and on Stampede so players see the premium herd is real.
   */
  async pulseLonghorns(ms = 1400): Promise<void> {
    const cells = this.longhornCells();
    if (!cells.length) {
      this.pulseBoard(10);
      await sleep(ms * 0.5);
      return;
    }
    this.dimExcept(cells);
    await this.playWinCells(cells, ms);
    // Soft reset dims without killing wild badges mid-ceremony
    for (const reel of this.reels) {
      for (const spr of reel.cells) {
        spr.alpha = 1;
        spr.tint = 0xffffff;
      }
    }
    this.fxLayer.removeChildren();
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
