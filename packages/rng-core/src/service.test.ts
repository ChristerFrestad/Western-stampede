import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FailingEntropy,
  OsCspongeEntropy,
  SeededEntropy,
  ThrowingEntropy,
} from './entropy.js';
import { RngService } from './service.js';
import { RNG_ALGORITHM_ID, RNG_BUILD_ID } from './types.js';

describe('RngService', () => {
  it('draws with audit fields and algorithm pin', async () => {
    const svc = new RngService({
      entropySource: new SeededEntropy(123),
      provider: 'test',
    });
    const d = await svc.draw({
      maxExclusive: 10,
      purpose: 'reel.stop.0',
      correlationId: 'round-1',
    });
    assert.equal(d.provider, 'test');
    assert.equal(d.algorithm, RNG_ALGORITHM_ID);
    assert.equal(d.buildId, RNG_BUILD_ID);
    assert.equal(d.purpose, 'reel.stop.0');
    assert.equal(d.correlationId, 'round-1');
    assert.ok(d.value >= 0 && d.value < 10);
    assert.ok(d.drawId.length > 10);
    assert.equal(d.rawHash.length, 64);
    assert.ok(d.drawnAt.includes('T'));
  });

  it('openStream accumulates drawIds in meta', () => {
    const svc = new RngService({ entropySource: new SeededEntropy(1) });
    const stream = svc.openStream('corr-abc');
    stream.nextInt(5, 'reel.stop.0');
    stream.nextInt(5, 'reel.stop.1');
    const meta = stream.meta();
    assert.equal(meta.streamId, 'corr-abc');
    assert.equal(meta.drawCount, 2);
    assert.equal(meta.drawIds?.length, 2);
    assert.equal(stream.getDraws().length, 2);
    assert.equal(stream.getDraws()[0]!.purpose, 'reel.stop.0');
  });

  it('refuses draws immediately when entropy health probe fails', async () => {
    const svc = new RngService({
      entropySource: new FailingEntropy(),
      maxConsecutiveFailures: 3,
    });
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 2,
          purpose: 'x',
          correlationId: 'c1',
        }),
      /RNG_UNAVAILABLE/,
    );
    assert.equal(svc.health().failClosed, true);
  });

  it('fail-closed after consecutive entropy throw failures', async () => {
    const svc = new RngService({
      entropySource: new ThrowingEntropy(),
      maxConsecutiveFailures: 2,
    });
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 2,
          purpose: 'x',
          correlationId: 'c1',
        }),
      /ENTROPY_UNAVAILABLE/,
    );
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 2,
          purpose: 'x',
          correlationId: 'c2',
        }),
      /ENTROPY_UNAVAILABLE/,
    );
    // Now fail-closed — subsequent draws throw RNG_UNAVAILABLE before entropy
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 2,
          purpose: 'x',
          correlationId: 'c3',
        }),
      /RNG_UNAVAILABLE/,
    );
    const h = svc.health();
    assert.equal(h.failClosed, true);
    assert.equal(h.status, 'failed');
  });

  it('invokes onDraw ledger hook', async () => {
    const seen: string[] = [];
    const svc = new RngService({
      entropySource: new SeededEntropy(3),
      onDraw: (d) => {
        seen.push(d.drawId);
      },
    });
    await svc.draw({
      maxExclusive: 4,
      purpose: 'feature.stampede',
      correlationId: 'r',
    });
    assert.equal(seen.length, 1);
  });

  it('OsCspongeEntropy produces values in range (live)', async () => {
    const svc = new RngService({
      entropySource: new OsCspongeEntropy(),
      provider: 'live-smoke',
    });
    for (let i = 0; i < 50; i++) {
      const d = await svc.draw({
        maxExclusive: 17,
        purpose: 'smoke',
        correlationId: `c-${i}`,
      });
      assert.ok(d.value >= 0 && d.value < 17);
    }
    assert.equal(svc.health().status, 'ok');
  });

  it('rejects invalid purpose / range', async () => {
    const svc = new RngService({ entropySource: new SeededEntropy(1) });
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 0,
          purpose: 'x',
          correlationId: 'c',
        }),
      /RNG_INVALID_RANGE/,
    );
    await assert.rejects(
      () =>
        svc.draw({
          maxExclusive: 2,
          purpose: '',
          correlationId: 'c',
        }),
      /RNG_INVALID_PURPOSE/,
    );
  });
});
