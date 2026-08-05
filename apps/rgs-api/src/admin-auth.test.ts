import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import type express from 'express';
import { env } from './config.js';
import { resolveAdmin, requireSuper } from './admin-auth.js';
import { MemoryStore, hashApiKey, setStore } from './store/index.js';

function req(headers: Record<string, string>): express.Request {
  return { headers } as unknown as express.Request;
}

describe('admin RBAC', () => {
  beforeEach(async () => {
    const store = new MemoryStore();
    await store.ensureDemoOperator();
    await store.createOperator({
      code: 'brand-x',
      name: 'Brand X',
      apiKeyHash: hashApiKey('brand-x-key'),
    });
    setStore(store);
  });

  it('accepts super admin token', async () => {
    const ctx = await resolveAdmin(
      req({ 'x-admin-token': env.adminToken }),
    );
    assert.equal(ctx?.role, 'super');
    assert.equal(requireSuper(ctx), true);
  });

  it('accepts operator key with scoped role', async () => {
    const ctx = await resolveAdmin(
      req({ 'x-operator-key': 'brand-x-key' }),
    );
    assert.equal(ctx?.role, 'operator');
    assert.equal(ctx?.operatorCode, 'brand-x');
    assert.equal(requireSuper(ctx), false);
  });

  it('rejects bad credentials', async () => {
    const ctx = await resolveAdmin(req({ 'x-admin-token': 'nope' }));
    assert.equal(ctx, null);
  });
});
