/**
 * PCG64 (PCG XSL RR 128/64) — simulation / offline only.
 *
 * Based on Melissa E. O'Neill's PCG family (https://www.pcg-random.org/).
 * 128-bit state, 64-bit output. NOT a CSPRNG — forbidden on REAL_MONEY paths.
 *
 * Reference: imneme/pcg-c (pcg_oneseq_128_xsl_rr_64_random_r)
 */

const MASK64 = (1n << 64n) - 1n;
const MASK128 = (1n << 128n) - 1n;

/** Default multiplier for 128-bit PCG (from O'Neill). */
const PCG_MULT =
  2549297995355413924n * (1n << 64n) + 4865540595714422341n;

/** Default stream increment (must be odd). */
const PCG_INC = (117n << 1n) | 1n;

function rot64(x: bigint, r: number): bigint {
  const rr = BigInt(r & 63);
  return ((x >> rr) | (x << (64n - rr))) & MASK64;
}

/**
 * One step of pcg_oneseq_128_xsl_rr_64: advance state, return 64-bit output.
 */
export function pcg64Next(state: bigint): { state: bigint; value: bigint } {
  const old = state & MASK128;
  const next = (old * PCG_MULT + PCG_INC) & MASK128;
  // XSL RR: xor-shift low, then random rotate
  const hi = old >> 64n;
  const lo = old & MASK64;
  const xorshifted = hi ^ lo;
  const rot = Number(old >> 122n); // top 6 bits
  const value = rot64(xorshifted, rot);
  return { state: next, value };
}

/** Seed 128-bit state from one or two 64-bit seeds (SplitMix-style mix). */
export function pcg64Seed(seed0: bigint | number, seed1?: bigint | number): bigint {
  let s0 = BigInt(seed0) & MASK64;
  let s1 = seed1 !== undefined ? BigInt(seed1) & MASK64 : mix64(s0 ^ 0x9e3779b97f4a7c15n);
  // Avoid zero-ish degenerate state
  if (s0 === 0n && s1 === 0n) s0 = 1n;
  // Warm-up: run a few steps from (s1<<64)|s0
  let state = ((s1 << 64n) | s0) & MASK128;
  for (let i = 0; i < 8; i++) {
    state = pcg64Next(state).state;
  }
  return state;
}

function mix64(z: bigint): bigint {
  z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
  z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
  return (z ^ (z >> 31n)) & MASK64;
}

/**
 * Unbiased integer in [0, maxExclusive) from PCG64 stream.
 * Rejection sampling on 64-bit output (same principle as production mapper).
 */
export function pcg64NextInt(
  state: bigint,
  maxExclusive: number,
): { state: bigint; value: number } {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive must be a positive safe integer');
  }
  if (maxExclusive === 1) {
    return { state, value: 0 };
  }

  const n = BigInt(maxExclusive);
  // threshold = 2^64 % n  → reject values in [2^64 - (2^64 % n), 2^64)
  // equivalent: limit = floor(2^64 / n) * n; accept u < limit; return u % n
  const two64 = 1n << 64n;
  const limit = (two64 / n) * n;
  let s = state;
  for (let attempt = 0; attempt < 64; attempt++) {
    const step = pcg64Next(s);
    s = step.state;
    const u = step.value;
    if (u < limit) {
      return { state: s, value: Number(u % n) };
    }
  }
  throw new Error('PCG64_REJECTION_EXHAUSTED');
}
