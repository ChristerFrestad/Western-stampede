import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpinCadence, estimateSpinMs } from './spin-timing.js';

describe('spin cadence', () => {
  it('starts all reels together then stops left to right', () => {
    const plan = buildSpinCadence();
    assert.equal(plan.simultaneousStart, true);
    assert.equal(plan.minSimultaneousMs > 0, true);
    assert.deepEqual(plan.stopOrder, [0, 1, 2, 3, 4]);
  });

  it('lengthens anticipation reels only', () => {
    const plan = buildSpinCadence({ anticipationReels: [3, 4] });
    assert.ok(plan.stopDurationMs[3]! > plan.stopDurationMs[0]!);
    assert.ok(plan.stopDurationMs[4]! > plan.stopDurationMs[1]!);
  });

  it('estimates total duration > min simultaneous', () => {
    const plan = buildSpinCadence();
    assert.ok(estimateSpinMs(plan) > plan.minSimultaneousMs + 5 * 500);
  });
});
