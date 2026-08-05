import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HashChain } from './hash-chain.js';

describe('HashChain', () => {
  it('links events and verifies', () => {
    const c = new HashChain();
    c.append({ type: 'spin', payload: { roundId: 'r1', debit: 100 } });
    c.append({ type: 'spin', payload: { roundId: 'r2', debit: 100 } });
    assert.equal(c.length, 2);
    assert.equal(c.verify().ok, true);
    assert.notEqual(c.toArray()[0]!.hash, c.toArray()[1]!.hash);
  });

  it('detects tampering', () => {
    const c = new HashChain();
    c.append({ type: 'admin', payload: { action: 'balance' } });
    // mutate stored payload without re-hashing
    (c.toArray()[0] as { payload: unknown }).payload = { action: 'hacked' };
    assert.equal(c.verify().ok, false);
  });
});
