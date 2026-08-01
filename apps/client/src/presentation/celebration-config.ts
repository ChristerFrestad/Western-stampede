/** Bet-relative win tiers (totalWin / bet). Configurable in one place. */
export const WIN_TIERS = {
  /** Below this: count-up only, no full-screen banner. */
  big: 15,
  mega: 40,
  super: 80,
} as const;

export type BannerTier = 'big' | 'mega' | 'super';

export const COUNT_UP = {
  minMs: 450,
  maxMs: 3400,
  baseMs: 380,
  logScale: 280,
};

/** Duration for racing count-up from totalWin magnitude. */
export function countUpDurationMs(totalWin: number): number {
  const d = COUNT_UP.baseMs + COUNT_UP.logScale * Math.log1p(Math.max(0, totalWin));
  return Math.min(COUNT_UP.maxMs, Math.max(COUNT_UP.minMs, d));
}

export function tierForMult(mult: number): 'none' | 'micro' | 'small' | 'big' | 'mega' | 'super' {
  if (mult <= 0) return 'none';
  if (mult >= WIN_TIERS.super) return 'super';
  if (mult >= WIN_TIERS.mega) return 'mega';
  if (mult >= WIN_TIERS.big) return 'big';
  if (mult >= 1) return 'small';
  return 'micro';
}

/** Banner stages earned by this mult (in order). */
export function bannersForMult(mult: number): BannerTier[] {
  const out: BannerTier[] = [];
  if (mult >= WIN_TIERS.big) out.push('big');
  if (mult >= WIN_TIERS.mega) out.push('mega');
  if (mult >= WIN_TIERS.super) out.push('super');
  return out;
}

export const BANNER_LABEL: Record<BannerTier, string> = {
  big: 'BIG WIN',
  mega: 'MEGA WIN',
  super: 'SUPER WIN',
};
