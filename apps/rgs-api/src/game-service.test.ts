import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { GameService } from './game-service.js';
import { MemoryStore, setStore } from './store/index.js';

describe('GameService spin (async store)', () => {
  let store: MemoryStore;
  let svc: GameService;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.ensureDemoOperator();
    setStore(store);
    svc = new GameService();
  });

  it('guest spin debits bet and attaches math hash + draw ids', async () => {
    const { player } = await store.createGuest(10_000);
    const result = await svc.spin(player.id, {
      bet: 100,
      clientRoundId: 'cr-1',
    });
    assert.equal(result.bet, 100);
    assert.ok(result.roundId);
    assert.ok(result.mathContentHash);
    assert.equal(result.mathContentHash!.length, 64);
    assert.ok(result.rngMeta.algorithm);
    assert.ok((result.rngMeta.drawIds?.length ?? 0) >= 5);
    const p = await store.getPlayer(player.id);
    assert.equal(result.balance, p!.balance);
    assert.ok(svc.audit.verify().ok);
  });

  it('is idempotent on clientRoundId under serial TX', async () => {
    const { player } = await store.createGuest(10_000);
    const a = await svc.spin(player.id, { bet: 100, clientRoundId: 'same' });
    const b = await svc.spin(player.id, { bet: 100, clientRoundId: 'same' });
    assert.equal(a.roundId, b.roundId);
    const m = await store.metrics();
    assert.equal(m.rounds, 1);
  });

  it('concurrent same clientRoundId yields single debit', async () => {
    const { player } = await store.createGuest(10_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        svc.spin(player.id, { bet: 100, clientRoundId: 'race-1' }),
      ),
    );
    const ids = new Set(results.map((r) => r.roundId));
    assert.equal(ids.size, 1);
    const one = results[0]!;
    const p = await store.getPlayer(player.id);
    // Exactly one debit of 100, plus any win credited once
    assert.equal(p!.balance, 10_000 - 100 + one.totalWin);
    const m = await store.metrics();
    assert.equal(m.rounds, 1);
    assert.equal(m.wagered, 100);
  });

  it('rejects insufficient funds', async () => {
    const { player } = await store.createGuest(50);
    await assert.rejects(
      () => svc.spin(player.id, { bet: 100, clientRoundId: 'x' }),
      /INSUFFICIENT_FUNDS/,
    );
  });
});
