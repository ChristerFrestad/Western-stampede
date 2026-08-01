import type { SpinResult } from '@ws/shared';
import { audio } from '../audio';
import type { ReelView } from '../reel-view';
import {
  WIN_TIERS,
  bannersForMult,
  countUpDurationMs,
  tierForMult,
  type BannerTier,
} from './celebration-config';
import { createBannerOverlay } from './banners';
import { runReelWinSequence } from './win-director';

type Phase =
  | 'idle'
  | 'reel_wins'
  | 'counting'
  | 'banner_big'
  | 'banner_mega'
  | 'banner_super'
  | 'done';

function sleep(ms: number, skip: SkipGate): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => {
      skip.off(onSkip);
      resolve();
    }, ms);
    const onSkip = () => {
      window.clearTimeout(t);
      skip.off(onSkip);
      resolve();
    };
    skip.on(onSkip);
  });
}

/** Debounced skip bus for Space / stage click. */
class SkipGate {
  private listeners = new Set<() => void>();
  private last = 0;
  private bound = false;

  private handler = (e: Event) => {
    if (e instanceof KeyboardEvent) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      // Don't steal space when typing in inputs
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))
        return;
      e.preventDefault();
    }
    // Ignore clicks on footer controls
    if (e instanceof PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('footer, header, .modal, button, select, a')) return;
    }
    const now = performance.now();
    if (now - this.last < 100) return;
    this.last = now;
    audio.click();
    for (const fn of [...this.listeners]) fn();
  };

  arm() {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', this.handler, true);
    window.addEventListener('pointerdown', this.handler, true);
  }

  disarm() {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('keydown', this.handler, true);
    window.removeEventListener('pointerdown', this.handler, true);
    this.listeners.clear();
  }

  on(fn: () => void) {
    this.listeners.add(fn);
  }

  off(fn: () => void) {
    this.listeners.delete(fn);
  }

  /** Wait until next skip or timeout. Returns true if skipped. */
  wait(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (skipped: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(tid);
        this.off(onSkip);
        resolve(skipped);
      };
      const onSkip = () => finish(true);
      const tid = window.setTimeout(() => finish(false), ms);
      this.on(onSkip);
    });
  }
}

export interface CelebrationOpts {
  featureWinSum?: number;
  featureWinEl?: HTMLElement | null;
  lastWinEl: HTMLElement;
  turbo?: boolean;
}

/**
 * Full Vegas-style celebration with skip ladder.
 * Does not alter totalWin — presentation only.
 */
export async function runCelebration(
  reels: ReelView,
  result: SpinResult,
  opts: CelebrationOpts,
): Promise<{ tier: ReturnType<typeof tierForMult> }> {
  const mult = result.bet > 0 ? result.totalWin / result.bet : 0;
  const tier = tierForMult(mult);
  const banners = bannersForMult(mult);
  const turbo = opts.turbo ?? false;

  if (result.totalWin <= 0) {
    opts.lastWinEl.textContent = '0';
    reels.resetPresentation();
    return { tier: 'none' };
  }

  const skip = new SkipGate();
  skip.arm();
  const banner = createBannerOverlay();
  banner.setSkipHint(true);

  let phase: Phase = 'reel_wins';
  let skipReelWins = false;
  let skipToCountEnd = false;
  let bannerIndex = -1; // index into banners[]

  const onGlobalSkip = () => {
    if (phase === 'reel_wins') {
      skipReelWins = true;
    } else if (phase === 'counting') {
      skipToCountEnd = true;
    } else if (phase === 'banner_big' || phase === 'banner_mega' || phase === 'banner_super') {
      // advance banner handled in banner loop via wait()
    }
  };
  skip.on(onGlobalSkip);

  try {
    // --- REEL WINS (every combination) ---
    phase = 'reel_wins';
    await runReelWinSequence(reels, result, {
      turbo: turbo || skipReelWins,
      shouldAbort: () => skipReelWins,
    });

    // --- COUNTING ---
    phase = 'counting';
    const duration = turbo ? Math.min(500, countUpDurationMs(result.totalWin)) : countUpDurationMs(result.totalWin);
    banner.showCounting(0, tier === 'micro' || tier === 'small' ? 'YOU WIN' : 'COUNTING UP');

    let display = 0;
    let crossedBig = false;
    let crossedMega = false;
    let crossedSuper = false;
    const start = performance.now();
    const bigAt = WIN_THRESHOLD_VALUE(result.bet, 'big');
    const megaAt = WIN_THRESHOLD_VALUE(result.bet, 'mega');
    const superAt = WIN_THRESHOLD_VALUE(result.bet, 'super');

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (skipToCountEnd) {
          display = result.totalWin;
          banner.updateCount(display);
          opts.lastWinEl.textContent = display.toLocaleString();
          resolve();
          return;
        }
        const t = Math.min(1, (performance.now() - start) / duration);
        // Speedy casino: ease-in (accelerates)
        const eased = t * t;
        display = Math.floor(result.totalWin * eased);
        banner.updateCount(display);
        opts.lastWinEl.textContent = display.toLocaleString();

        if (!crossedBig && display >= bigAt && mult >= WIN_TIERS.big) {
          crossedBig = true;
          banner.flashThreshold('big');
          audio.winBig();
        }
        if (!crossedMega && display >= megaAt && mult >= WIN_TIERS.mega) {
          crossedMega = true;
          banner.flashThreshold('mega');
          audio.winBig();
        }
        if (!crossedSuper && display >= superAt && mult >= WIN_TIERS.super) {
          crossedSuper = true;
          banner.flashThreshold('super');
          audio.winBig();
        }

        if (t < 1) requestAnimationFrame(tick);
        else {
          display = result.totalWin;
          banner.updateCount(display);
          opts.lastWinEl.textContent = display.toLocaleString();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });

    if (opts.featureWinEl && opts.featureWinSum != null && opts.featureWinSum > 0) {
      opts.featureWinEl.textContent = opts.featureWinSum.toLocaleString();
    }

    // --- BANNERS ---
    for (let i = 0; i < banners.length; i++) {
      const b = banners[i]!;
      phase =
        b === 'big' ? 'banner_big' : b === 'mega' ? 'banner_mega' : 'banner_super';
      bannerIndex = i;
      banner.showBanner(b, result.totalWin);
      if (b === 'super') audio.winSuper();
      else if (b === 'mega') audio.winMega();
      else audio.winBig();
      reels.pulseBoard(b === 'super' ? 20 : b === 'mega' ? 16 : 12);

      const hold = turbo ? 600 : b === 'super' ? 2800 : b === 'mega' ? 2200 : 1800;
      const skipped = await skip.wait(hold);
      if (skipped) {
        // Jump to next banner if any; else done
        continue;
      }
    }

    phase = 'done';
    await sleep(turbo ? 80 : 200, skip);
  } finally {
    skip.off(onGlobalSkip);
    skip.disarm();
    banner.hide();
    reels.resetPresentation();
  }

  return { tier };
}

function WIN_THRESHOLD_VALUE(bet: number, tier: BannerTier): number {
  return Math.floor(bet * WIN_TIERS[tier]);
}
