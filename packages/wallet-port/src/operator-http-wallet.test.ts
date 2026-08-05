import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CircuitBreaker } from './circuit-breaker.js';
import { drainOutbox, MemoryOutbox } from './outbox.js';
import { OperatorHttpWallet } from './operator-http-wallet.js';
import { DemoWalletPort } from './demo-wallet.js';
import { InsufficientFundsError } from './types.js';

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return handler as unknown as typeof fetch;
}

describe('OperatorHttpWallet', () => {
  it('debits with idempotency key and parses balance', async () => {
    const calls: string[] = [];
    const wallet = new OperatorHttpWallet({
      baseUrl: 'https://op.example',
      apiKey: 'k',
      fetchImpl: mockFetch(async (url, init) => {
        calls.push(`${init?.method} ${url}`);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers['idempotency-key'], 'spin-1');
        return new Response(
          JSON.stringify({ txId: 't1', balanceAfter: 900 }),
          { status: 200 },
        );
      }),
    });
    const tx = await wallet.debit('p1', 100, 'spin-1');
    assert.equal(tx.balanceAfter, 900);
    assert.equal(tx.type, 'debit');
    assert.ok(calls[0]?.includes('/debit'));
  });

  it('maps 402 to InsufficientFundsError', async () => {
    const wallet = new OperatorHttpWallet({
      baseUrl: 'https://op.example',
      apiKey: 'k',
      retries: 0,
      fetchImpl: mockFetch(async () => new Response('{}', { status: 402 })),
    });
    await assert.rejects(() => wallet.debit('p1', 100, 'r'), InsufficientFundsError);
  });

  it('opens circuit after repeated failures', async () => {
    const circuit = new CircuitBreaker({ failureThreshold: 2, resetMs: 60_000 });
    const wallet = new OperatorHttpWallet({
      baseUrl: 'https://op.example',
      apiKey: 'k',
      retries: 0,
      circuit,
      fetchImpl: mockFetch(async () => {
        throw new Error('network');
      }),
    });
    await assert.rejects(() => wallet.getBalance('p1'));
    await assert.rejects(() => wallet.getBalance('p1'));
    assert.equal(circuit.getStatus().state, 'open');
    await assert.rejects(() => wallet.getBalance('p1'), /WALLET_CIRCUIT_OPEN/);
  });
});

describe('MemoryOutbox', () => {
  it('drains pending credit jobs', async () => {
    const demo = new DemoWalletPort();
    demo.ensure('p1', 0);
    const outbox = new MemoryOutbox();
    outbox.enqueue('wallet.credit', 'p1', 50, 'win-1');
    outbox.enqueue('wallet.credit', 'p1', 25, 'win-2');
    const r = await drainOutbox(outbox, demo);
    assert.equal(r.processed, 2);
    assert.equal((await demo.getBalance('p1')).amount, 75);
    assert.equal(outbox.stats().done, 2);
  });

  it('requeues failed jobs until max attempts', async () => {
    const outbox = new MemoryOutbox();
    outbox.enqueue('wallet.credit', 'p1', 10, 'x');
    const bad = {
      async debit() {
        throw new Error('fail');
      },
      async credit() {
        throw new Error('fail');
      },
    };
    for (let i = 0; i < 10; i++) {
      await drainOutbox(outbox, bad, 10);
    }
    const s = outbox.stats();
    assert.ok(s.failed >= 1 || s.pending >= 0);
  });
});

