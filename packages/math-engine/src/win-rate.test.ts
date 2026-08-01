import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SeededPrng } from './rng.js';
import { SpinEngine } from './spin-engine.js';
import type { FreeGameSession } from './spin-engine.js';
import { defaultInternalMath } from './config/default-math.js';

/**
 * Lightweight win-rate / RTP smoke (not a full certification sim).
 * Fails if RTP is wildly off (broken paytable / free-game loop).
 */
describe('win rate smoke', () => {
  it('base+natural free games RTP stays in a sane band over 50k spins', async () => {
    const spins = 50_000;
    const bet = 100;
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(12345));
    let wagered = 0;
    let won = 0;
    let freeSession: FreeGameSession | null = null;
    let hits = 0;

    for (let i = 0; i < spins; i++) {
      const out = await engine.spin({
        bet,
        mode: freeSession ? 'FREE' : 'BASE',
        freeSession,
      });
      wagered += out.debitAmount;
      won += out.result.totalWin;
      if (out.result.totalWin > 0) hits++;
      freeSession = out.nextFreeSession;
    }

    const rtp = won / wagered;
    const hitRate = hits / spins;
    // Demo math target ~90–100%; allow band for short sim variance
    assert.ok(rtp > 0.75 && rtp < 1.15, `RTP out of band: ${rtp}`);
    assert.ok(hitRate > 0.02 && hitRate < 0.35, `hitRate out of band: ${hitRate}`);
  });

  it('buy standard session mean mult roughly near costX for demo balance', async () => {
    const sessions = 800;
    const bet = 100;
    const math = defaultInternalMath();
    const costX = math.buyOptions.find((b) => b.tier === 'standard')!.costX;
    let totalWin = 0;

    for (let s = 0; s < sessions; s++) {
      const engine = new SpinEngine(math, new SeededPrng(9000 + s));
      let freeSession: FreeGameSession | null = null;
      let sessionWin = 0;
      let out = await engine.spin({ bet, mode: 'BASE', buyTier: 'standard' });
      sessionWin += out.result.totalWin;
      freeSession = out.nextFreeSession;
      while (freeSession && freeSession.remaining > 0) {
        out = await engine.spin({ bet, mode: 'FREE', freeSession });
        sessionWin += out.result.totalWin;
        freeSession = out.nextFreeSession;
      }
      totalWin += sessionWin;
    }

    const meanMult = totalWin / sessions / bet;
    const buyRtp = meanMult / costX;
    // Not exact — ensure not broken (0 or 10x house)
    assert.ok(buyRtp > 0.4 && buyRtp < 1.6, `buy RTP out of band: ${buyRtp} meanMult=${meanMult}`);
  });
});
