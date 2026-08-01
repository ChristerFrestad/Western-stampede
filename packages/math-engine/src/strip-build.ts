import type { SymbolId } from '@ws/shared';

/**
 * Build virtual reel strips from weighted bags with **shuffled mini-stacks**.
 *
 * Ways slots need occasional 2–3 stacks of the same symbol on a reel, but
 * dumping 14×9 then 14×10 looks broken and makes spin windows look fake.
 *
 * Approach: split each symbol’s count into chunks of size 1–3, shuffle chunks,
 * flatten. Multiset preserved → stop-uniform hit rates stay stable; RTP stays
 * in band because ways stacks still form.
 */

/** Simple LCG for reproducible strip layouts across builds. */
export function makeSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function expandParts(parts: Array<[SymbolId, number]>): SymbolId[] {
  const out: SymbolId[] = [];
  for (const [sym, n] of parts) {
    for (let i = 0; i < n; i++) out.push(sym);
  }
  return out;
}

/** Fisher–Yates with provided RNG. */
export function shuffleInPlace<T>(a: T[], random: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function shuffleSymbols(arr: SymbolId[], random: () => number): SymbolId[] {
  return shuffleInPlace([...arr], random);
}

/**
 * Split `count` copies of `sym` into chunks of size 1..maxStack.
 */
export function chunkSymbol(
  sym: SymbolId,
  count: number,
  maxStack: number,
  random: () => number,
): SymbolId[][] {
  const chunks: SymbolId[][] = [];
  let left = count;
  while (left > 0) {
    const max = Math.min(maxStack, left);
    // Bias: many 2–3 stacks (ways), occasional 4–5, still mix of singles
    let size = 1;
    const r = random();
    if (max >= 5 && r > 0.92) size = 5;
    else if (max >= 4 && r > 0.82) size = 4;
    else if (max >= 3 && r > 0.55) size = 3;
    else if (max >= 2 && r > 0.22) size = 2;
    else size = 1;
    size = Math.min(size, left);
    chunks.push(Array.from({ length: size }, () => sym));
    left -= size;
  }
  return chunks;
}

/**
 * Soft pass: if a run exceeds maxRun after join (from adjacent same chunks),
 * swap a later different chunk into place.
 */
export function breakLongRuns(arr: SymbolId[], maxRun: number, random: () => number): SymbolId[] {
  const a = [...arr];
  for (let i = 0; i < a.length; i++) {
    let run = 1;
    while (i + run < a.length && a[i + run] === a[i]) run++;
    if (run <= maxRun) {
      i += run - 1;
      continue;
    }
    for (let k = i + maxRun; k < i + run; k++) {
      for (let t = 0; t < 40; t++) {
        const j = k + 1 + Math.floor(random() * Math.max(1, a.length - k - 1));
        if (j >= a.length) break;
        if (a[j] !== a[k]) {
          const tmp = a[k]!;
          a[k] = a[j]!;
          a[j] = tmp;
          break;
        }
      }
    }
    i += run - 1;
  }
  return a;
}

/**
 * @param maxStack intentional ways stacks (2–3)
 * @param hardMax absolute run cap after joins (default 3)
 */
export function buildShuffledStrip(
  parts: Array<[SymbolId, number]>,
  seed: number,
  maxStack = 3,
  hardMax = 3,
): SymbolId[] {
  const random = makeSeededRandom(seed);
  const chunks: SymbolId[][] = [];
  for (const [sym, n] of parts) {
    if (n <= 0) continue;
    chunks.push(...chunkSymbol(sym, n, maxStack, random));
  }
  shuffleInPlace(chunks, random);
  let strip = chunks.flat();
  // Only break accidental joins above hardMax (keep intentional 2–3 stacks)
  strip = breakLongRuns(strip, hardMax, random);
  return strip;
}

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
