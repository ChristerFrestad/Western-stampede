import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { celebrationPhases } from './celebration-config';

describe('celebration skip phases', () => {
  it('small win: combos → count → total → done', () => {
    assert.deepEqual(celebrationPhases(2), [
      'reel_wins',
      'counting',
      'total',
      'done',
    ]);
  });

  it('big win includes BIG then total', () => {
    assert.deepEqual(celebrationPhases(20), [
      'reel_wins',
      'counting',
      'banner_big',
      'total',
      'done',
    ]);
  });

  it('mega win stacks BIG → MEGA → total', () => {
    assert.deepEqual(celebrationPhases(50), [
      'reel_wins',
      'counting',
      'banner_big',
      'banner_mega',
      'total',
      'done',
    ]);
  });

  it('super win stacks all tiers then total', () => {
    assert.deepEqual(celebrationPhases(100), [
      'reel_wins',
      'counting',
      'banner_big',
      'banner_mega',
      'banner_super',
      'total',
      'done',
    ]);
  });
});
