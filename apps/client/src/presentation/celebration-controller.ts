import type { SpinResult } from '@ws/shared';
import { audio } from '../audio';
import type { ReelView } from '../reel-view';
import {
  WIN_TIERS,
  bannersForMult,
  countUpDurationMs,
  tierForMult,
  type BannerTier,
  type CelePhase,
} from './celebration-config';
import { createBannerOverlay } from './banners';
import { runReelWinSequence } from './win-director';

export type { CelePhase } from './celebration-config';
export { celebrationPhases } from './celebration-config';

function bannerPhase(b: BannerTier): CelePhase {
  return b === 'big' ? 'banner_big' : b === 'mega' ? 'banner_mega' : 'banner_super';
}

/** Debounced skip bus for Space / stage click. One press = one advance. */
class SkipGate {
  private listeners = new Set<() => void>();
  private last = 0;
  private bound = false;
  /** When true, next skip is consumed without re-entry. */
  private lockedUntil = 0;

  private handler = (e: Event) => {
    if (e instanceof KeyboardEvent) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))
        return;
      e.preventDefault();
    }
    if (e instanceof PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('footer, header, .modal, button, select, a')) return;
    }
    const now = performance.now();
    if (now < this.lockedUntil) return;
    if (now - this.last < 220) return;
    this.last = now;
    this.lockedUntil = now + 180;
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
 * Full celebration with skip ladder:
 * Space → next phase only → after all tier banners → TOTAL WON → back to game.
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

  let phase: CelePhase = 'reel_wins';
  let skipReelWins = false;
  let skipToCountEnd = false;
  let leaveTotal = false;

  const onGlobalSkip = () => {
    if (phase === 'reel_wins') {
      skipReelWins = true;
    } else if (phase === 'counting') {
      skipToCountEnd = true;
    } else if (phase === 'total') {
      leaveTotal = true;
    }
    // banner phases: handled by skip.wait()
  };
  skip.on(onGlobalSkip);

  try {
    // --- 1) REEL WINS (every combination) ---
    phase = 'reel_wins';
    audio.setMusicStem(mult >= WIN_TIERS.big ? 'win' : 'base');
    await runReelWinSequence(reels, result, {
      turbo: turbo || skipReelWins,
      shouldAbort: () => skipReelWins,
    });

    // --- 2) COUNTING ---
    phase = 'counting';
    skipToCountEnd = turbo;
    const duration = turbo
      ? Math.min(400, countUpDurationMs(result.totalWin))
      : countUpDurationMs(result.totalWin);
    banner.showCounting(
      0,
      tier === 'micro' || tier === 'small' ? 'YOU WIN' : 'COUNTING UP',
    );
    audio.countUpTick();

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
        const eased = t * t;
        display = Math.floor(result.totalWin * eased);
        banner.updateCount(display);
        opts.lastWinEl.textContent = display.toLocaleString();

        // Occasional meter tick
        if (Math.floor(t * 20) !== Math.floor((t - 0.016) * 20)) {
          audio.countUpTick();
        }

        if (!crossedBig && display >= bigAt && mult >= WIN_TIERS.big) {
          crossedBig = true;
          banner.flashThreshold('big');
          audio.winBig();
        }
        if (!crossedMega && display >= megaAt && mult >= WIN_TIERS.mega) {
          crossedMega = true;
          banner.flashThreshold('mega');
          audio.winMega();
        }
        if (!crossedSuper && display >= superAt && mult >= WIN_TIERS.super) {
          crossedSuper = true;
          banner.flashThreshold('super');
          audio.winSuper();
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

    // --- 3) TIER BANNERS (BIG → MEGA → SUPER) — one Space each ---
    for (const b of banners) {
      phase = bannerPhase(b);
      banner.showBanner(b, result.totalWin);
      if (b === 'super') audio.winSuper();
      else if (b === 'mega') audio.winMega();
      else audio.winBig();
      reels.pulseBoard(b === 'super' ? 20 : b === 'mega' ? 16 : 12);

      const hold = turbo ? 500 : b === 'super' ? 2800 : b === 'mega' ? 2200 : 1800;
      await skip.wait(hold);
      // skipped or timed out → next phase (next banner or total)
    }

    // --- 4) TOTAL WON (always) — Space returns to game ---
    phase = 'total';
    leaveTotal = turbo;
    banner.showTotal(result.totalWin, {
      featureTotal:
        opts.featureWinSum != null && opts.featureWinSum > 0 ? opts.featureWinSum : undefined,
    });
    audio.totalWin();
    opts.lastWinEl.textContent = result.totalWin.toLocaleString();

    const totalHold = turbo ? 400 : mult >= WIN_TIERS.big ? 3200 : 2000;
    if (!leaveTotal) {
      await new Promise<void>((resolve) => {
        const onSkip = () => {
          leaveTotal = true;
        };
        skip.on(onSkip);
        const startT = performance.now();
        const poll = () => {
          if (leaveTotal || performance.now() - startT >= totalHold) {
            skip.off(onSkip);
            resolve();
            return;
          }
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      });
    }

    phase = 'done';
  } finally {
    skip.off(onGlobalSkip);
    skip.disarm();
    banner.hide();
    reels.resetPresentation();
    // Restore ambient bed (free stem if still in feature handled by main)
    if (audio.getMusicStem() === 'win') {
      audio.setMusicStem('base');
    }
  }

  return { tier };
}

function WIN_THRESHOLD_VALUE(bet: number, tier: BannerTier): number {
  return Math.floor(bet * WIN_TIERS[tier]);
}
