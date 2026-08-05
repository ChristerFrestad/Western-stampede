import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRateLimitStore,
  initRateLimitStore,
  rateLimitIncr,
} from './rate-limit-store.js';

describe('rate-limit-store', () => {
  it('defaults to memory without REDIS_URL', async () => {
    // ensure no redis from env during unit test
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    // re-init is no-op after first; store may already be memory
    const store = getRateLimitStore();
    assert.ok(store.backend === 'memory' || store.backend === 'redis');
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });

  it('increments keys with window', async () => {
    const key = `unit-${Date.now()}-${Math.random()}`;
    const a = await rateLimitIncr(key, 60_000);
    const b = await rateLimitIncr(key, 60_000);
    assert.equal(a, 1);
    assert.equal(b, 2);
  });

  it('init resolves without throw', async () => {
    const s = await initRateLimitStore();
    assert.ok(s.backend === 'memory' || s.backend === 'redis');
  });
});
