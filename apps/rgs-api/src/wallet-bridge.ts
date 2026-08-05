/**
 * Seamless wallet bridge + outbox (memory or Postgres).
 */
import {
  CircuitBreaker,
  DemoWalletPort,
  MemoryOutbox,
  OperatorHttpWallet,
  drainOutboxPort,
  type OutboxPort,
  type WalletPort,
} from '@ws/wallet-port';
import { getStore } from './store/index.js';
import { PostgresOutbox } from './store/postgres-outbox.js';

let port: WalletPort | null = null;
let memoryOutbox = new MemoryOutbox();
let pgOutbox: PostgresOutbox | null = null;
const circuit = new CircuitBreaker({ failureThreshold: 5, resetMs: 15_000 });

export async function initWalletOutbox(): Promise<void> {
  const store = getStore();
  if (store.kind === 'postgres') {
    // Reuse store's pool via dynamic access — PostgresStore has private pool.
    // Attach outbox through a one-shot connection from DATABASE_URL.
    const url = process.env.DATABASE_URL ?? '';
    if (url) {
      const pg = await import('pg');
      const pool = new pg.default.Pool({ connectionString: url, max: 4 });
      pgOutbox = new PostgresOutbox(pool);
      await pgOutbox.ensureSchema();
    }
  }
}

function getOutbox(): OutboxPort {
  return pgOutbox ?? memoryOutbox;
}

export function getWalletBridge(): {
  mode: 'demo' | 'seamless' | 'off';
  port: WalletPort | null;
  outbox: OutboxPort;
  circuit: CircuitBreaker;
  outboxBackend: 'memory' | 'postgres';
} {
  const mode = (process.env.WALLET_MODE ?? 'off') as 'demo' | 'seamless' | 'off';
  const outboxBackend = pgOutbox ? 'postgres' : 'memory';
  if (mode === 'off') {
    return { mode: 'off', port: null, outbox: getOutbox(), circuit, outboxBackend };
  }
  if (mode === 'demo') {
    if (!port) port = new DemoWalletPort();
    return { mode: 'demo', port, outbox: getOutbox(), circuit, outboxBackend };
  }
  if (!port) {
    const url = process.env.OPERATOR_WALLET_URL ?? '';
    const key = process.env.OPERATOR_WALLET_KEY ?? '';
    if (!url || !key) {
      throw new Error('SEAMLESS_WALLET_MISCONFIGURED');
    }
    port = new OperatorHttpWallet({
      baseUrl: url,
      apiKey: key,
      circuit,
    });
  }
  return {
    mode: 'seamless',
    port,
    outbox: getOutbox(),
    circuit,
    outboxBackend,
  };
}

export async function mirrorWinCredit(
  playerExternalRef: string,
  amount: number,
  ref: string,
  operatorId?: string,
): Promise<void> {
  const bridge = getWalletBridge();
  if (bridge.mode !== 'seamless' || !bridge.port || amount <= 0) return;
  try {
    await bridge.port.credit(playerExternalRef, amount, ref);
  } catch {
    await Promise.resolve(
      bridge.outbox.enqueue(
        'wallet.credit',
        playerExternalRef,
        amount,
        ref,
        operatorId,
      ),
    );
  }
}

export async function processWalletOutbox(): Promise<{
  processed: number;
  failed: number;
}> {
  const bridge = getWalletBridge();
  if (!bridge.port) return { processed: 0, failed: 0 };
  return drainOutboxPort(bridge.outbox, bridge.port);
}
