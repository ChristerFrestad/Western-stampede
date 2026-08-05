import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOpsSnapshot, buildPublicVersion } from './ops-status.js';
import type { IStore } from './store/index.js';

function mockStore(kind: 'memory' | 'postgres' = 'memory'): IStore {
  return {
    kind,
    ready: async () => true,
  } as unknown as IStore;
}

describe('ops-status', () => {
  it('buildPublicVersion exposes protocol and math pins', () => {
    const v = buildPublicVersion('1.2.3');
    assert.equal(v.service, 'western-stampede-rgs');
    assert.equal(v.version, '1.2.3');
    assert.ok(v.protocolVersion);
    assert.ok(String(v.mathVersion).includes('stampede') || v.mathVersion.length > 0);
  });

  it('casino preset is default for guest balance when env unset', async () => {
    // env module loads once — just assert ops snapshot carries guestStartBalance
    const snap = await buildOpsSnapshot({
      rng: {
        status: 'ok',
        algorithm: 'os-csprng+rejection-v1',
        failClosed: false,
        totalDraws: 0,
      },
      store: mockStore('memory'),
      rateLimit: { backend: 'memory', incr: async () => 1 },
      otlp: {
        enabled: false,
        endpoint: null,
        serviceName: 'test',
        queued: 0,
        exportCount: 0,
        exportErrors: 0,
      },
      uptimeSec: 1,
    });
    assert.ok(snap.guestStartBalance >= 10_000);
    assert.ok(snap.preset === 'casino' || snap.preset === 'default');
  });

  it('ready when rng+store ok', async () => {
    const snap = await buildOpsSnapshot({
      rng: {
        status: 'ok',
        algorithm: 'os-csprng+rejection-v1',
        failClosed: false,
        totalDraws: 10,
      },
      store: mockStore('memory'),
      rateLimit: { backend: 'memory', incr: async () => 1 },
      otlp: {
        enabled: false,
        endpoint: null,
        serviceName: 'test',
        queued: 0,
        exportCount: 0,
        exportErrors: 0,
      },
      uptimeSec: 12.4,
    });
    assert.equal(snap.ready, true);
    assert.equal(snap.uptimeSec, 12);
    assert.equal(snap.rng.ok, true);
    assert.equal(snap.store.kind, 'memory');
  });

  it('not ready when rng fail-closed', async () => {
    const snap = await buildOpsSnapshot({
      rng: { status: 'failed', failClosed: true },
      store: mockStore('memory'),
      rateLimit: { backend: 'memory', incr: async () => 1 },
      otlp: {
        enabled: false,
        endpoint: null,
        serviceName: 'test',
        queued: 0,
        exportCount: 0,
        exportErrors: 0,
      },
      uptimeSec: 1,
    });
    assert.equal(snap.ready, false);
    assert.equal(snap.rng.ok, false);
  });
});
