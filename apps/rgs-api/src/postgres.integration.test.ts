/**
 * Integration tests against real Postgres when DATABASE_URL is set.
 * Skips cleanly otherwise (local without Docker still green).
 *
 * CI sets DATABASE_URL via service container.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { GameService } from './game-service.js';
import { setStore } from './store/index.js';
import { PostgresStore } from './store/postgres-store.js';

const url = process.env.DATABASE_URL ?? '';
const run = url.length > 0;

describe('Postgres durable integration', { skip: !run }, () => {
  let store: PostgresStore;
  let svc: GameService;

  before(async () => {
    store = await PostgresStore.connect(url);
    await store.ensureDemoOperator();
    setStore(store);
    svc = new GameService();
  });

  after(async () => {
    // pool ends with process; no public end — ok for CI
  });

  it('persists guest spin and survives re-read', async () => {
    const { player, token } = await store.createGuest(5000);
    assert.ok(token);
    const result = await svc.spin(player.id, {
      bet: 100,
      clientRoundId: `pg-${Date.now()}`,
    });
    const round = await store.getRound(result.roundId);
    assert.ok(round);
    assert.equal(round!.operatorId, player.operatorId);
    assert.equal(round!.result.mathContentHash?.length, 64);

    const again = await store.findByClientRound(
      player.id,
      round!.clientRoundId,
    );
    assert.equal(again?.id, result.roundId);

    const p = await store.getPlayer(player.id);
    assert.equal(p!.balance, 5000 - 100 + result.totalWin);
  });

  it('idempotent clientRoundId in postgres TX', async () => {
    const { player } = await store.createGuest(8000);
    const id = `pg-idem-${Date.now()}`;
    const a = await svc.spin(player.id, { bet: 100, clientRoundId: id });
    const b = await svc.spin(player.id, { bet: 100, clientRoundId: id });
    assert.equal(a.roundId, b.roundId);
    const m = await store.metrics(player.operatorId);
    // at least this player contributed one wager of 100 among operator metrics
    assert.ok(m.wagered >= 100);
  });
});
