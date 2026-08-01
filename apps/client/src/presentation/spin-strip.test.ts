import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpinFiller,
  maxRunLength,
  uniqueCount,
} from './spin-strip';

describe('presentation spin strip', () => {
  it('filler has no long same-symbol runs', () => {
    const strip = buildSpinFiller(80, { maxRun: 2 });
    assert.ok(maxRunLength(strip) <= 2);
  });

  it('filler uses many different symbols', () => {
    const strip = buildSpinFiller(60);
    assert.ok(uniqueCount(strip) >= 6);
  });

  it('is mixed not sorted blocks', () => {
    const strip = buildSpinFiller(40);
    // should not start with 8+ identical
    let run = 1;
    for (let i = 1; i < strip.length; i++) {
      if (strip[i] === strip[0]) run++;
      else break;
    }
    assert.ok(run <= 2);
  });
});
