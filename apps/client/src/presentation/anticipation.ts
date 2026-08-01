import type { SymbolId } from '@ws/shared';

const SCATTER_LIKE = new Set(['SCATTER', 'SUPERCOIN']);

export function isScatterLikeId(s: string): boolean {
  return SCATTER_LIKE.has(s);
}

/** Which reels should use slow anticipation stop (presentation only). */
export function anticipationReels(grid: SymbolId[][]): number[] {
  const hasScatter = grid.map((reel) => reel.some((s) => isScatterLikeId(s)));
  const total = hasScatter.filter(Boolean).length;

  // 2 scatters → tease remaining reels that don't have scatter
  if (total === 2) {
    const out: number[] = [];
    for (let r = 0; r < grid.length; r++) {
      if (!hasScatter[r]) out.push(r);
    }
    // Prefer later reels for drama
    return out.filter((r) => r >= 2);
  }

  // 1 scatter early → mild anticipation on last 2 reels if empty
  if (total === 1 && hasScatter[0]) {
    return [3, 4].filter((r) => !hasScatter[r]);
  }

  return [];
}

/** True if this is a scatter near-miss (2 scatters, no trigger). */
export function isScatterNearMiss(grid: SymbolId[][]): boolean {
  let n = 0;
  for (const reel of grid) {
    for (const s of reel) {
      if (isScatterLikeId(s)) n++;
    }
  }
  return n === 2;
}
