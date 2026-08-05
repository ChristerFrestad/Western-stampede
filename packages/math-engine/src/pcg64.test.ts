import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pcg64Next, pcg64NextInt, pcg64Seed } from './pcg64.js';
import { SeededPrng } from './rng.js';

describe('pcg64', () => {
  it('seed is deterministic', () => {
    const a = pcg64Seed(42);
    const b = pcg64Seed(42);
    assert.equal(a, b);
    assert.notEqual(pcg64Seed(42), pcg64Seed(43));
  });

  it('produces deterministic 64-bit stream', () => {
    let s = pcg64Seed(1);
    const vals: string[] = [];
    for (let i = 0; i < 5; i++) {
      const step = pcg64Next(s);
      s = step.state;
      vals.push(step.value.toString(16));
    }
    let s2 = pcg64Seed(1);
    const vals2: string[] = [];
    for (let i = 0; i < 5; i++) {
      const step = pcg64Next(s2);
      s2 = step.state;
      vals2.push(step.value.toString(16));
    }
    assert.deepEqual(vals, vals2);
  });

  it('nextInt always in range', () => {
    let s = pcg64Seed(99);
    for (const n of [2, 6, 7, 13, 100, 3456]) {
      for (let i = 0; i < 200; i++) {
        const r = pcg64NextInt(s, n);
        s = r.state;
        assert.ok(r.value >= 0 && r.value < n);
      }
    }
  });

  it('SeededPrng (PCG) is deterministic and in-range', () => {
    const a = new SeededPrng(12345);
    const b = new SeededPrng(12345);
    for (let i = 0; i < 50; i++) {
      assert.equal(a.nextInt(100), b.nextInt(100));
    }
    const c = new SeededPrng(7);
    for (let i = 0; i < 1000; i++) {
      const v = c.nextInt(17);
      assert.ok(v >= 0 && v < 17);
    }
  });

  it('SeededPrng meta marks sim-only PCG', () => {
    const m = new SeededPrng(1).meta();
    assert.equal(m.algorithm, 'pcg64-xsl-rr-sim-only');
    assert.equal(m.provider, 'seeded-sim');
  });

  it('covers all residues for n=6', () => {
    let s = pcg64Seed(2026);
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const r = pcg64NextInt(s, 6);
      s = r.state;
      seen.add(r.value);
    }
    assert.equal(seen.size, 6);
  });
});
