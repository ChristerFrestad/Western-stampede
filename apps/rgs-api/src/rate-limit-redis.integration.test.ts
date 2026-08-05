/**
 * Redis rate-limit integration — skipped unless REDIS_URL is set and reachable.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import {
  initRateLimitStore,
  rateLimitIncr,
  resetRateLimitStoreForTests,
  getRateLimitStore,
} from './rate-limit-store.js';

const redisUrl = process.env.REDIS_URL ?? '';
const run = Boolean(redisUrl);

describe('redis rate-limit integration', { skip: !run }, () => {
  before(async () => {
    process.env.REDIS_URL = redisUrl;
    const store = await initRateLimitStore({ force: true });
    if (store.backend !== 'redis') {
      // unreachable redis → skip assertions by throwing skip-like message
      throw new Error(
        'REDIS_URL set but backend is memory (redis unreachable) — failing integration test',
      );
    }
  });

  after(async () => {
    await resetRateLimitStoreForTests();
  });

  it('uses redis backend', () => {
    assert.equal(getRateLimitStore().backend, 'redis');
  });

  it('increments shared keys', async () => {
    const key = `itest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const a = await rateLimitIncr(key, 60_000);
    const b = await rateLimitIncr(key, 60_000);
    const c = await rateLimitIncr(key, 60_000);
    assert.equal(a, 1);
    assert.equal(b, 2);
    assert.equal(c, 3);
  });

  it('isolates different keys', async () => {
    const k1 = `iso-a-${Date.now()}`;
    const k2 = `iso-b-${Date.now()}`;
    assert.equal(await rateLimitIncr(k1, 60_000), 1);
    assert.equal(await rateLimitIncr(k2, 60_000), 1);
  });
});
