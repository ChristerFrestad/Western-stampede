import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DemoWalletPort } from './demo-wallet.js';
import { InsufficientFundsError } from './types.js';

describe('DemoWalletPort', () => {
  it('debits and credits with balance tracking', async () => {
    const w = new DemoWalletPort();
    w.ensure('p1', 1000);
    assert.equal((await w.getBalance('p1')).amount, 1000);
    const d = await w.debit('p1', 200, 'spin-1');
    assert.equal(d.balanceAfter, 800);
    const c = await w.credit('p1', 50, 'win-1');
    assert.equal(c.balanceAfter, 850);
  });

  it('rejects insufficient funds', async () => {
    const w = new DemoWalletPort();
    w.ensure('p1', 10);
    await assert.rejects(() => w.debit('p1', 11, 'x'), InsufficientFundsError);
  });
});
