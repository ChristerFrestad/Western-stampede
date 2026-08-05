import { createHash } from 'node:crypto';
import type { EntropySource } from './types.js';

export interface UnbiasedDrawResult {
  /** Uniform integer in [0, maxExclusive). */
  value: number;
  /** Raw bytes that produced the accepted candidate (for audit hash). */
  rawBytes: Uint8Array;
  /** Number of rejected candidates before acceptance. */
  rejections: number;
}

/**
 * Unbiased mapping from CSPRNG bytes to integer in [0, maxExclusive)
 * using classic rejection sampling (no modulo bias).
 *
 * Algorithm (32-bit path for maxExclusive <= 2^32):
 *   Let M = 2^32.
 *   Let limit = floor(M / n) * n  // largest multiple of n below M
 *   Draw u ~ Uniform{0..M-1} as big-endian uint32
 *   If u >= limit, reject and retry
 *   Else return u % n
 *
 * For maxExclusive === 1, returns 0 without consuming entropy? We still
 * consume 0 bytes and return 0 — maxExclusive must be >= 1; for 1 the only
 * legal value is 0 (degenerate uniform).
 *
 * Proof sketch: accepted u is uniform on {0,1,...,limit-1} which has
 * exactly (limit/n) complete residue classes mod n, hence u % n is uniform.
 *
 * @see docs/compliance/RNG_DESIGN.md
 */
export function unbiasedInt(
  entropy: EntropySource,
  maxExclusive: number,
): UnbiasedDrawResult {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('RNG_INVALID_RANGE');
  }
  if (maxExclusive === 1) {
    return { value: 0, rawBytes: new Uint8Array(0), rejections: 0 };
  }

  // Use 32-bit when range fits; 48-bit otherwise up to Number.MAX_SAFE_INTEGER.
  // Slot strip lengths and feature weights are far below 2^32.
  if (maxExclusive <= 0x1_0000_0000) {
    return unbiasedUint32(entropy, maxExclusive);
  }
  return unbiasedUint48(entropy, maxExclusive);
}

function unbiasedUint32(
  entropy: EntropySource,
  n: number,
): UnbiasedDrawResult {
  // 2^32 as Number is exact.
  const M = 0x1_0000_0000;
  const limit = Math.floor(M / n) * n;
  let rejections = 0;

  // Safety: expected rejections are tiny; hard cap prevents infinite loop
  // on a broken entropy source that always returns 0xff bytes.
  const maxAttempts = 64;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = entropy.randomBytes(4);
    const u =
      ((raw[0]! << 24) | (raw[1]! << 16) | (raw[2]! << 8) | raw[3]!) >>> 0;
    if (u < limit) {
      return { value: u % n, rawBytes: raw, rejections };
    }
    rejections++;
  }
  throw new Error('RNG_REJECTION_EXHAUSTED');
}

/**
 * For n > 2^32, sample 48-bit integers (still within MAX_SAFE_INTEGER maths).
 * 2^48 is exact in IEEE-754 doubles.
 */
function unbiasedUint48(
  entropy: EntropySource,
  n: number,
): UnbiasedDrawResult {
  const M = 0x1_0000_0000_0000; // 2^48
  const limit = Math.floor(M / n) * n;
  let rejections = 0;
  const maxAttempts = 64;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = entropy.randomBytes(6);
    const u =
      raw[0]! * 0x1_0000_0000_00 +
      raw[1]! * 0x1_0000_0000 +
      raw[2]! * 0x1_0000_00 +
      raw[3]! * 0x1_0000 +
      raw[4]! * 0x100 +
      raw[5]!;
    if (u < limit) {
      return { value: u % n, rawBytes: raw, rejections };
    }
    rejections++;
  }
  throw new Error('RNG_REJECTION_EXHAUSTED');
}

/** SHA-256 hex of raw draw bytes (empty input → empty hash of empty buffer). */
export function hashRawBytes(raw: Uint8Array): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Fill a buffer with CSPRNG bytes (for NIST bit-stream export).
 * Not used for game outcome mapping — only lab harness.
 */
export function fillRandomBytes(
  entropy: EntropySource,
  size: number,
): Uint8Array {
  return entropy.randomBytes(size);
}
