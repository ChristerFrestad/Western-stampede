import type { SpinResult, WinDetail } from '@ws/shared';
import { audio } from '../audio';
import type { ReelView } from '../reel-view';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export interface ReelWinOpts {
  turbo?: boolean;
  shouldAbort?: () => boolean;
}

/**
 * Animate every paying combination with sequential L→R highlight + explainer pills.
 */
export async function runReelWinSequence(
  reels: ReelView,
  result: SpinResult,
  opts?: ReelWinOpts,
): Promise<void> {
  const turbo = opts?.turbo ?? false;
  reels.resetPresentation();

  if (result.totalWin <= 0) return;

  // Wild reveal first (extension of wild art → mult badge)
  if (result.wildMults?.length) {
    if (!opts?.shouldAbort?.()) {
      await reels.playWildLand(result.wildMults, turbo ? 280 : 820);
      audio.wildLand();
    }
  }

  const wins = result.wins;
  if (!wins.length) {
    reels.pulseBoard(8);
    return;
  }

  // Turbo / abort: one aggregate pulse
  if (turbo || opts?.shouldAbort?.()) {
    const all = collectCells(wins);
    reels.dimExcept(all);
    if (result.wildMults?.length) reels.showWildBadges(result.wildMults);
    await reels.playWinCells(all, 280);
    audio.winCycle();
    reels.showWinPill(
      wins.length > 1
        ? `${wins.length} combinations · +${result.totalWin.toLocaleString()}`
        : formatWinPill(wins[0]!),
    );
    await sleep(220);
    reels.hideWinPill();
    return;
  }

  // Full cycle — every win, sequential L→R composition
  const maxCycle = 8;
  const list = wins.slice(0, maxCycle);
  for (const w of list) {
    if (opts?.shouldAbort?.()) break;
    const cells = w.cells?.length ? w.cells : [];

    // Wild badges only for mults on cells in this combo
    if (result.wildMults?.length && cells.length) {
      const cellSet = new Set(cells.map((c) => `${c.reel},${c.row}`));
      const relevant = result.wildMults.filter((m) => cellSet.has(`${m.reel},${m.row}`));
      reels.showWildBadges(relevant);
    }

    if (cells.length) {
      reels.dimExcept(cells);
      await reels.playWinCellsSequential(cells, {
        stepMs: 130,
        holdMs: 480,
        shouldAbort: opts?.shouldAbort,
      });
    } else {
      reels.highlightWins([w]);
      await sleep(400);
    }

    reels.showWinPill(formatWinPill(w));
    if (w.symbol === 'LONGHORN') audio.longhornWin();
    else audio.winCycle();
    await sleep(620);
  }

  if (wins.length > maxCycle) {
    reels.showWinPill(`+${wins.length - maxCycle} more combinations`);
    await sleep(500);
  }

  // Combo celebration
  if (wins.length > 1 && !opts?.shouldAbort?.()) {
    const all = collectCells(wins);
    reels.dimExcept(all);
    if (result.wildMults?.length) reels.showWildBadges(result.wildMults);
    reels.showWinPill(
      `${wins.length} WINNING COMBOS · +${result.totalWin.toLocaleString()}`,
    );
    await reels.playWinCells(all, 700);
    reels.pulseBoard(14);
    audio.winBig();
    await sleep(750);
  }

  reels.hideWinPill();
}

/** @deprecated use runCelebration — kept for any direct imports */
export async function runWinDirector(
  reels: ReelView,
  result: SpinResult,
  els: {
    lastWin: HTMLElement;
    featureWinVal?: HTMLElement | null;
    featureWinSum?: number;
  },
  opts?: { turbo?: boolean },
): Promise<{ tier: 'none' | 'micro' | 'small' | 'big' | 'mega' }> {
  await runReelWinSequence(reels, result, { turbo: opts?.turbo });
  els.lastWin.textContent = result.totalWin.toLocaleString();
  if (els.featureWinVal && els.featureWinSum != null) {
    els.featureWinVal.textContent = els.featureWinSum.toLocaleString();
  }
  const mult = result.bet > 0 ? result.totalWin / result.bet : 0;
  if (mult >= 20) return { tier: 'mega' };
  if (mult >= 5) return { tier: 'big' };
  if (mult >= 1) return { tier: 'small' };
  if (mult > 0) return { tier: 'micro' };
  return { tier: 'none' };
}

function collectCells(wins: WinDetail[]): { reel: number; row: number }[] {
  const set = new Set<string>();
  const out: { reel: number; row: number }[] = [];
  for (const w of wins) {
    for (const c of w.cells ?? []) {
      const k = `${c.reel},${c.row}`;
      if (!set.has(k)) {
        set.add(k);
        out.push(c);
      }
    }
  }
  return out;
}

function formatWinPill(w: WinDetail): string {
  const base = `${w.symbol} ×${w.count} · ${w.ways} ways L→R · +${w.amount.toLocaleString()}`;
  return w.mult > 1 ? `${base} · wild ×${w.mult}` : base;
}
