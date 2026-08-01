import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SymbolId } from '@ws/shared';
import {
  buildShuffledStrip,
  expandParts,
  maxRunLength,
  shuffleSymbols,
  makeSeededRandom,
} from './strip-build.js';

describe('strip build shuffle', () => {
  const PAD: Array<[SymbolId, number]> = [
    [SymbolId.NINE, 14],
    [SymbolId.TEN, 14],
    [SymbolId.J, 12],
    [SymbolId.Q, 12],
    [SymbolId.K, 10],
    [SymbolId.A, 10],
  ];

  it('clumped expand has huge runs', () => {
    const clumped = expandParts(PAD);
    assert.ok(maxRunLength(clumped) >= 10);
  });

  it('shuffled strip preserves multiset counts', () => {
    const raw = expandParts(PAD);
    const shuffled = buildShuffledStrip(PAD, 42, 2);
    assert.equal(shuffled.length, raw.length);
    const count = (arr: SymbolId[], s: SymbolId) => arr.filter((x) => x === s).length;
    for (const [sym] of PAD) {
      assert.equal(count(shuffled, sym), count(raw, sym));
    }
  });

  it('shuffled strip has no 10+ clumped runs but allows mini-stacks', () => {
    const shuffled = buildShuffledStrip(PAD, 99, 5, 5);
    const run = maxRunLength(shuffled);
    assert.ok(run <= 5, `max run ${run} should be ≤5`);
    assert.ok(run >= 1);
  });

  it('is mixed — not sorted low-card blocks', () => {
    const shuffled = buildShuffledStrip(PAD, 42, 5, 5);
    // first 16 cells should include several symbol types
    const head = new Set(shuffled.slice(0, 16));
    assert.ok(head.size >= 3, `head diversity ${head.size}`);
  });

  it('seeded shuffle is deterministic', () => {
    const a = shuffleSymbols(expandParts(PAD), makeSeededRandom(7));
    const b = shuffleSymbols(expandParts(PAD), makeSeededRandom(7));
    assert.deepEqual(a, b);
  });
});
