import type { SymbolId } from '@ws/shared';

/**
 * Presentation-only spin strip builder.
 * Server outcomes are authoritative; this only makes the scroll look like a real
 * shuffled reel (no 999999JJJJJJ bands).
 */

/** Weighted pool mirroring a typical ways-strip density (not math strips). */
const WEIGHTS: Array<{ id: SymbolId; w: number }> = [
  { id: '9' as SymbolId, w: 14 },
  { id: '10' as SymbolId, w: 14 },
  { id: 'J' as SymbolId, w: 12 },
  { id: 'Q' as SymbolId, w: 12 },
  { id: 'K' as SymbolId, w: 10 },
  { id: 'A' as SymbolId, w: 10 },
  { id: 'EAGLE' as SymbolId, w: 5 },
  { id: 'COYOTE' as SymbolId, w: 4 },
  { id: 'WOLF' as SymbolId, w: 4 },
  { id: 'STAG' as SymbolId, w: 3 },
  { id: 'LONGHORN' as SymbolId, w: 3 },
  { id: 'WILD' as SymbolId, w: 2 },
  { id: 'SCATTER' as SymbolId, w: 1 },
];

const TOTAL_W = WEIGHTS.reduce((a, x) => a + x.w, 0);

export interface SpinStripOpts {
  /** Max identical symbols in a row (default 2 — rare intentional stacks). */
  maxRun?: number;
  /** Prefer not repeating the same symbol every other cell either. */
  avoidAltRepeat?: boolean;
  /** Optional RNG for tests. */
  random?: () => number;
}

function pickWeighted(random: () => number): SymbolId {
  let r = random() * TOTAL_W;
  for (const { id, w } of WEIGHTS) {
    r -= w;
    if (r <= 0) return id;
  }
  return WEIGHTS[WEIGHTS.length - 1]!.id;
}

function trailingRun(strip: SymbolId[], sym: SymbolId): number {
  let n = 0;
  for (let i = strip.length - 1; i >= 0; i--) {
    if (strip[i] === sym) n++;
    else break;
  }
  return n;
}

/**
 * Build a mixed spin-filler strip with anti-run enforcement.
 * Looks shuffled — never long blocks of 9s / 10s / J / Q / K.
 */
export function buildSpinFiller(count: number, opts?: SpinStripOpts): SymbolId[] {
  const maxRun = opts?.maxRun ?? 2;
  const avoidAlt = opts?.avoidAltRepeat ?? true;
  const random = opts?.random ?? Math.random;
  const out: SymbolId[] = [];

  for (let i = 0; i < count; i++) {
    let pick = pickWeighted(random);
    let guard = 0;
    while (guard++ < 40) {
      if (trailingRun(out, pick) >= maxRun) {
        pick = pickWeighted(random);
        continue;
      }
      if (
        avoidAlt &&
        out.length >= 2 &&
        out[out.length - 2] === pick &&
        out[out.length - 1] !== pick
      ) {
        // break A B A B banding
        pick = pickWeighted(random);
        continue;
      }
      break;
    }
    out.push(pick);
  }
  return out;
}

/** Next single symbol for live re-roll during continuous spin. */
export function nextSpinSymbol(prev: SymbolId | null, opts?: SpinStripOpts): SymbolId {
  const maxRun = opts?.maxRun ?? 2;
  const random = opts?.random ?? Math.random;
  // sample until different enough from prev (allow 1-stack only by default when prev set)
  let pick = pickWeighted(random);
  let guard = 0;
  while (guard++ < 24 && prev != null && pick === prev && maxRun <= 1) {
    pick = pickWeighted(random);
  }
  // default maxRun 2: 50% force change if same
  if (prev != null && pick === prev && random() < 0.65) {
    pick = pickWeighted(random);
  }
  return pick;
}

/** Max consecutive identical symbols in a strip (for tests). */
export function maxRunLength(strip: SymbolId[]): number {
  if (!strip.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < strip.length; i++) {
    if (strip[i] === strip[i - 1]) {
      cur++;
      best = Math.max(best, cur);
    } else cur = 1;
  }
  return best;
}

/** Unique symbol count. */
export function uniqueCount(strip: SymbolId[]): number {
  return new Set(strip).size;
}
