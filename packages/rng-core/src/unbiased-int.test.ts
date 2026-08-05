import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SeededEntropy } from './entropy.js';
import { hashRawBytes, unbiasedInt } from './unbiased-int.js';

describe('unbiasedInt', () => {
  it('rejects non-positive and non-integer ranges', () => {
    const e = new SeededEntropy(1);
    assert.throws(() => unbiasedInt(e, 0), /RNG_INVALID_RANGE/);
    assert.throws(() => unbiasedInt(e, -1), /RNG_INVALID_RANGE/);
    assert.throws(() => unbiasedInt(e, 1.5), /RNG_INVALID_RANGE/);
  });

  it('returns 0 for maxExclusive === 1 without error', () => {
    const e = new SeededEntropy(42);
    const r = unbiasedInt(e, 1);
    assert.equal(r.value, 0);
    assert.equal(r.rejections, 0);
  });

  it('always returns value in [0, n)', () => {
    const e = new SeededEntropy(99);
    for (const n of [2, 3, 6, 7, 13, 100, 256, 1000, 3456]) {
      for (let i = 0; i < 500; i++) {
        const r = unbiasedInt(e, n);
        assert.ok(r.value >= 0 && r.value < n, `n=${n} value=${r.value}`);
        assert.ok(Number.isInteger(r.value));
      }
    }
  });

  it('produces a stable rawHash helper', () => {
    const h1 = hashRawBytes(new Uint8Array([1, 2, 3]));
    const h2 = hashRawBytes(new Uint8Array([1, 2, 3]));
    const h3 = hashRawBytes(new Uint8Array([1, 2, 4]));
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
    assert.equal(h1.length, 64);
  });

  it('covers all residues for small n over many draws (smoke)', () => {
    const e = new SeededEntropy(7);
    const n = 6;
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      seen.add(unbiasedInt(e, n).value);
    }
    assert.equal(seen.size, n, `expected all residues 0..${n - 1}`);
  });
});
