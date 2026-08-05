import { CircuitBreaker } from './circuit-breaker.js';
import {
  InsufficientFundsError,
  type Money,
  type WalletPort,
  type WalletTx,
} from './types.js';

export interface OperatorHttpWalletOptions {
  baseUrl: string;
  apiKey: string;
  /** Request timeout ms. Default 5000. */
  timeoutMs?: number;
  /** Retries on 5xx / network. Default 2. */
  retries?: number;
  fetchImpl?: typeof fetch;
  circuit?: CircuitBreaker;
}

/**
 * Production-oriented seamless wallet client (operator HTTP).
 * Idempotency via `Idempotency-Key` header = ref.
 */
export class OperatorHttpWallet implements WalletPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  readonly circuit: CircuitBreaker;

  constructor(opts: OperatorHttpWalletOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.retries = opts.retries ?? 2;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.circuit = opts.circuit ?? new CircuitBreaker();
  }

  async getBalance(playerRef: string): Promise<Money> {
    const data = await this.request(
      'GET',
      `/v1/players/${encodeURIComponent(playerRef)}/balance`,
    );
    return {
      amount: Number(data.amount),
      currency: String(data.currency ?? 'EUR'),
    };
  }

  async debit(
    playerRef: string,
    amount: number,
    ref: string,
  ): Promise<WalletTx> {
    const data = await this.request(
      'POST',
      `/v1/players/${encodeURIComponent(playerRef)}/debit`,
      { amount, ref },
      ref,
    );
    return mapTx(data, playerRef, 'debit', amount, ref);
  }

  async credit(
    playerRef: string,
    amount: number,
    ref: string,
  ): Promise<WalletTx> {
    const data = await this.request(
      'POST',
      `/v1/players/${encodeURIComponent(playerRef)}/credit`,
      { amount, ref },
      ref,
    );
    return mapTx(data, playerRef, 'credit', amount, ref);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    this.circuit.assertClosed();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            ...(idempotencyKey
              ? { 'idempotency-key': idempotencyKey }
              : {}),
          },
          body: body != null ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (res.status === 402) {
          this.circuit.recordSuccess();
          throw new InsufficientFundsError();
        }
        if (res.status >= 500) {
          throw new Error(`WALLET_HTTP_${res.status}`);
        }
        if (!res.ok) {
          this.circuit.recordSuccess();
          throw new Error(`WALLET_HTTP_${res.status}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        this.circuit.recordSuccess();
        return data;
      } catch (e) {
        lastErr = e;
        if (e instanceof InsufficientFundsError) throw e;
        this.circuit.recordFailure();
        if (attempt === this.retries) break;
        await sleep(50 * (attempt + 1));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('WALLET_REQUEST_FAILED');
  }
}

function mapTx(
  data: Record<string, unknown>,
  playerRef: string,
  type: 'debit' | 'credit',
  amount: number,
  ref: string,
): WalletTx {
  return {
    txId: String(data.txId ?? data.id ?? ref),
    playerRef,
    amount: type === 'debit' ? -Math.abs(amount) : Math.abs(amount),
    type,
    ref,
    balanceAfter: Number(data.balanceAfter ?? data.balance ?? 0),
    at: String(data.at ?? new Date().toISOString()),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
