export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Failures before opening. Default 5. */
  failureThreshold?: number;
  /** ms to stay open before half-open. Default 10_000. */
  resetMs?: number;
}

/**
 * Simple circuit breaker for operator wallet HTTP.
 * Open circuit fails fast → RGS can surface WALLET_UNAVAILABLE.
 */
export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetMs = opts.resetMs ?? 10_000;
  }

  getStatus(): { state: CircuitState; failures: number } {
    this.maybeHalfOpen();
    return { state: this.state, failures: this.failures };
  }

  assertClosed(): void {
    this.maybeHalfOpen();
    if (this.state === 'open') {
      throw new Error('WALLET_CIRCUIT_OPEN');
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  private maybeHalfOpen(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.resetMs) {
      this.state = 'half_open';
    }
  }
}
