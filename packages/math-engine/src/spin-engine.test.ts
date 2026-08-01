import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoPrng, SeededPrng } from './rng.js';
import { SpinEngine } from './spin-engine.js';
import { defaultInternalMath } from './config/default-math.js';

describe('SpinEngine free games & buy', () => {
  it('natural forced scatters enter free games with session bet pinned', async () => {
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(7));
    const out = await engine.spin({
      bet: 100,
      mode: 'BASE',
      forceFreeGames: 3,
    });
    assert.equal(out.debitAmount, 100);
    assert.equal(out.result.features.enteredFreeGames, true);
    assert.equal(out.result.features.buyEntered, false);
    assert.ok([8, 15, 20].includes(out.result.features.freeGamesAwarded));
    assert.equal(
      out.result.features.freeGamesRemaining,
      out.result.features.freeGamesAwarded,
    );
    assert.equal(out.nextFreeSession?.sessionBet, 100);
    assert.equal(
      out.nextFreeSession?.remaining,
      out.result.features.freeGamesAwarded,
    );
  });

  it('buy standard debits costX*bet and starts free session', async () => {
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(1));
    const out = await engine.spin({
      bet: 100,
      mode: 'BASE',
      buyTier: 'standard',
    });
    assert.equal(out.debitAmount, 2200);
    assert.equal(out.result.features.buyEntered, true);
    assert.equal(out.result.features.freeGamesAwarded, 8);
    // first free spin consumed one
    assert.equal(out.result.features.freeGamesRemaining, out.nextFreeSession?.remaining);
    assert.ok((out.nextFreeSession?.remaining ?? 0) >= 0);
    assert.ok((out.nextFreeSession?.remaining ?? -1) <= 8 + 20); // package + possible retrigger
    assert.equal(out.nextFreeSession?.sessionBet, 100);
    assert.equal(out.result.bet, 100);
  });

  it('enhanced buy applies supercoin inject before first spin (longhornInjected > 0)', async () => {
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(99));
    const out = await engine.spin({
      bet: 100,
      mode: 'BASE',
      buyTier: 'enhanced',
    });
    assert.equal(out.debitAmount, 8000);
    assert.equal(out.result.features.buyEntered, true);
    assert.ok(out.result.features.supercoin);
    assert.ok((out.result.features.supercoin?.totalLonghornsInjected ?? 0) > 0);
    // session carries inject for subsequent spins
    assert.ok((out.nextFreeSession?.longhornInjected ?? 0) > 0);
  });

  it('rejects bet change during free session', async () => {
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(2));
    const first = await engine.spin({
      bet: 100,
      mode: 'BASE',
      buyTier: 'standard',
    });
    assert.ok(first.nextFreeSession);
    await assert.rejects(
      () =>
        engine.spin({
          bet: 200,
          mode: 'FREE',
          freeSession: first.nextFreeSession,
        }),
      /BET_LOCKED/,
    );
  });

  it('free spin debits zero and uses session bet for pays', async () => {
    const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(3));
    const buy = await engine.spin({
      bet: 100,
      mode: 'BASE',
      buyTier: 'standard',
    });
    if (!buy.nextFreeSession || buy.nextFreeSession.remaining <= 0) return;
    const free = await engine.spin({
      bet: 100,
      mode: 'FREE',
      freeSession: buy.nextFreeSession,
    });
    assert.equal(free.debitAmount, 0);
    assert.equal(free.result.bet, 100);
  });
});
