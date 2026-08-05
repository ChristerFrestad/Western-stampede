import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SeededPrng } from './rng.js';
import { captureSpinDraws, verifySpinReplay } from './replay.js';

describe('spin replay verification', () => {
  it('replays identical outcome from recorded draws', () => {
    const rng = new SeededPrng(12345);
    const { draws, output } = captureSpinDraws(
      { bet: 100, mode: 'BASE' },
      rng,
    );
    assert.ok(draws.length >= 5);
    const check = verifySpinReplay(
      { bet: 100, mode: 'BASE' },
      draws,
      {
        grid: output.result.grid,
        stops: output.result.stops,
        totalWin: output.result.totalWin,
        mathContentHash: output.result.mathContentHash,
        heights: output.result.heights,
        mode: output.result.mode,
      },
    );
    assert.equal(check.ok, true, check.details);
  });

  it('detects tampered totalWin expectation', () => {
    const rng = new SeededPrng(99);
    const { draws, output } = captureSpinDraws(
      { bet: 100, mode: 'BASE' },
      rng,
    );
    const check = verifySpinReplay(
      { bet: 100, mode: 'BASE' },
      draws,
      {
        grid: output.result.grid,
        stops: output.result.stops,
        totalWin: output.result.totalWin + 1,
        mathContentHash: output.result.mathContentHash,
        heights: output.result.heights,
        mode: output.result.mode,
      },
    );
    assert.equal(check.ok, false);
    assert.equal(check.totalWinMatch, false);
  });
});
