import type { SpinResult, WinDetail } from '@ws/shared';
import { audio } from '../audio';
import type { ReelView } from '../reel-view';
import { countUpElement } from './win-meter';

export interface WinDirectorEls {
  lastWin: HTMLElement;
  featureWinVal?: HTMLElement | null;
  featureWinSum?: number;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Post-stop presentation: wilds → dim → win cells → meter count-up → tier toast hook.
 */
export async function runWinDirector(
  reels: ReelView,
  result: SpinResult,
  els: WinDirectorEls,
  opts?: { turbo?: boolean },
): Promise<{ tier: 'none' | 'micro' | 'small' | 'big' | 'mega' }> {
  const turbo = opts?.turbo ?? false;
  reels.resetPresentation();

  const mult = result.bet > 0 ? result.totalWin / result.bet : 0;
  let tier: 'none' | 'micro' | 'small' | 'big' | 'mega' = 'none';
  if (result.totalWin <= 0) {
    await countUpElement(els.lastWin, 0, 120);
    return { tier: 'none' };
  }
  if (mult >= 20) tier = 'mega';
  else if (mult >= 5) tier = 'big';
  else if (mult >= 1) tier = 'small';
  else tier = 'micro';

  await sleep(turbo ? 80 : 220);

  // 1) Wild land FX (always show mults when present)
  if (result.wildMults?.length) {
    await reels.playWildLand(result.wildMults, turbo ? 400 : 900);
    audio.wildLand();
  }

  // 2) Dim non-winners, light win cells
  const allCells = collectCells(result.wins);
  if (allCells.length) {
    reels.dimExcept(allCells);
    await reels.playWinCells(allCells, turbo ? 350 : 700);
    audio.winCycle();
  } else if (result.wins.length) {
    // Fallback: highlight by symbol id
    reels.highlightWins(result.wins);
  }

  // 3) Cycle win pills (optional short)
  if (!turbo && result.wins.length > 1) {
    for (const w of result.wins.slice(0, 3)) {
      reels.showWinPill(formatWinPill(w));
      if (w.cells?.length) {
        reels.dimExcept(w.cells);
        await reels.playWinCells(w.cells, 500);
      }
      await sleep(650);
    }
    reels.hideWinPill();
    if (allCells.length) reels.dimExcept(allCells);
  } else if (result.wins[0]) {
    reels.showWinPill(formatWinPill(result.wins[0]!));
    await sleep(turbo ? 200 : 500);
    reels.hideWinPill();
  }

  // 4) Meter count-up
  const meterMs = turbo ? 250 : tier === 'mega' ? 1100 : tier === 'big' ? 850 : 550;
  await countUpElement(els.lastWin, result.totalWin, meterMs);
  if (els.featureWinVal != null && els.featureWinSum != null && els.featureWinSum > 0) {
    await countUpElement(els.featureWinVal, els.featureWinSum, meterMs * 0.7);
  }

  // 5) Board pulse by tier
  if (tier === 'big' || tier === 'mega') {
    reels.pulseBoard(tier === 'mega' ? 18 : 12);
  }

  await sleep(turbo ? 100 : 250);
  reels.resetPresentation();
  return { tier };
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
  return `${w.symbol} · ${w.count}oak · ${w.ways} ways · +${w.amount.toLocaleString()}${
    w.mult > 1 ? ` · ×${w.mult}` : ''
  }`;
}
