import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { GameService } from './game-service.js';
import { MemoryStore, hashApiKey, setStore } from './store/index.js';

describe('multi-tenant isolation', () => {
  let store: MemoryStore;
  let svc: GameService;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.ensureDemoOperator();
    setStore(store);
    svc = new GameService();
  });

  it('demo guest is scoped to demo operator', async () => {
    const { player } = await store.createGuest(1000);
    assert.ok(player.operatorId);
    const op = await store.getOperatorById(player.operatorId);
    assert.equal(op?.code, 'demo');
  });

  it('operator A cannot read operator B rounds', async () => {
    const opA = await store.createOperator({
      code: 'op-a',
      name: 'Operator A',
      apiKeyHash: hashApiKey('key-a'),
    });
    const opB = await store.createOperator({
      code: 'op-b',
      name: 'Operator B',
      apiKeyHash: hashApiKey('key-b'),
    });

    const sessA = await store.createOperatorSession({
      operatorId: opA.id,
      externalRef: 'player-1',
      startBalance: 50_000,
    });
    const sessB = await store.createOperatorSession({
      operatorId: opB.id,
      externalRef: 'player-1',
      startBalance: 50_000,
    });

    // Same externalRef, different tenants → different player ids
    assert.notEqual(sessA.player.id, sessB.player.id);

    const spinA = await svc.spin(sessA.player.id, {
      bet: 100,
      clientRoundId: 't-a-1',
    });
    const spinB = await svc.spin(sessB.player.id, {
      bet: 100,
      clientRoundId: 't-b-1',
    });

    const leak = await store.getRoundForOperator(opA.id, spinB.roundId);
    assert.equal(leak, undefined);

    const own = await store.getRoundForOperator(opA.id, spinA.roundId);
    assert.ok(own);
    assert.equal(own!.operatorId, opA.id);

    const metricsA = await store.metrics(opA.id);
    const metricsB = await store.metrics(opB.id);
    assert.equal(metricsA.rounds, 1);
    assert.equal(metricsB.rounds, 1);
    assert.equal(metricsA.wagered, 100);
    assert.equal(metricsB.wagered, 100);
  });

  it('resolves operator by api key hash', async () => {
    await store.createOperator({
      code: 'acme',
      name: 'Acme',
      apiKeyHash: hashApiKey('secret-acme'),
    });
    const found = await store.getOperatorByApiKeyHash(hashApiKey('secret-acme'));
    assert.equal(found?.code, 'acme');
    const miss = await store.getOperatorByApiKeyHash(hashApiKey('wrong'));
    assert.equal(miss, undefined);
  });

  it('rotates operator api key and invalidates old hash', async () => {
    await store.createOperator({
      code: 'rotate-me',
      name: 'Rotate Co',
      apiKeyHash: hashApiKey('old-key-value'),
    });
    await store.rotateOperatorApiKey('rotate-me', hashApiKey('new-key-value'));
    assert.equal(
      await store.getOperatorByApiKeyHash(hashApiKey('old-key-value')),
      undefined,
    );
    const op = await store.getOperatorByApiKeyHash(hashApiKey('new-key-value'));
    assert.equal(op?.code, 'rotate-me');
  });
});
