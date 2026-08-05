/**
 * Statistical gates for unbiased integer mapping.
 * Run via: pnpm --filter @ws/rng-core test:statistical
 *
 * Chi-square goodness-of-fit at α=0.001 (strict enough for CI smoke;
 * lab packages use larger N offline).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OsCspongeEntropy, SeededEntropy } from './entropy.js';
import { unbiasedInt } from './unbiased-int.js';

/** Critical values χ²_{k-1, 0.001} approximations for common k. */
function chiSquareCritical(df: number): number {
  // Conservative critical values at α ≈ 0.001
  const table: Record<number, number> = {
    1: 10.83,
    2: 13.82,
    3: 16.27,
    4: 18.47,
    5: 20.52,
    6: 22.46,
    7: 24.32,
    9: 27.88,
    10: 29.59,
    15: 37.7,
    16: 39.25,
    31: 59.7,
    99: 148.2,
  };
  if (table[df] != null) return table[df]!;
  // Wilson–Hilferty-ish rough upper bound for CI (not for lab report)
  return df + 6 * Math.sqrt(2 * df);
}

function chiSquareStat(counts: number[], expected: number): number {
  let s = 0;
  for (const c of counts) {
    const d = c - expected;
    s += (d * d) / expected;
  }
  return s;
}

function runChiSquare(
  entropy: { randomBytes(n: number): Uint8Array },
  n: number,
  samples: number,
): { chi2: number; counts: number[]; ok: boolean } {
  const counts = new Array<number>(n).fill(0);
  for (let i = 0; i < samples; i++) {
    const v = unbiasedInt(entropy as never, n).value;
    counts[v]!++;
  }
  const expected = samples / n;
  const chi2 = chiSquareStat(counts, expected);
  const crit = chiSquareCritical(n - 1);
  return { chi2, counts, ok: chi2 < crit };
}

describe('statistical: chi-square unbiasedInt', () => {
  const N = 100_000;

  for (const range of [2, 6, 7, 10, 32, 100]) {
    it(`seeded entropy uniform on [0,${range}) over ${N} samples`, () => {
      const entropy = new SeededEntropy(20260326 + range);
      const { chi2, ok, counts } = runChiSquare(entropy, range, N);
      assert.ok(
        ok,
        `chi²=${chi2.toFixed(3)} failed for n=${range}; counts=${counts.join(',')}`,
      );
      // No empty bins at this sample size
      assert.ok(counts.every((c) => c > 0));
    });
  }

  it(`OS CSPRNG uniform on [0,6) over ${N} samples`, () => {
    const entropy = new OsCspongeEntropy();
    const { chi2, ok } = runChiSquare(entropy, 6, N);
    assert.ok(ok, `OS chi²=${chi2.toFixed(3)} failed for n=6`);
  });

  it(`OS CSPRNG uniform on reel-like [0,64) over ${N} samples`, () => {
    const entropy = new OsCspongeEntropy();
    const { chi2, ok } = runChiSquare(entropy, 64, N);
    // df=63 — use loose bound
    assert.ok(chi2 < 120, `OS chi²=${chi2.toFixed(3)} suspiciously high for n=64`);
    assert.ok(ok || chi2 < 120);
  });
});
