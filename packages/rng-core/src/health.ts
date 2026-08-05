import type { EntropySource, RngHealth, RngHealthStatus } from './types.js';
import { RNG_ALGORITHM_ID, RNG_BUILD_ID } from './types.js';

export interface HealthTrackerState {
  totalDraws: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastDrawAt: string | null;
  lastError: string | null;
}

export class HealthTracker {
  private totalDraws = 0;
  private totalFailures = 0;
  private consecutiveFailures = 0;
  private lastDrawAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly maxConsecutiveFailures: number) {
    if (maxConsecutiveFailures < 1) {
      throw new Error('maxConsecutiveFailures must be >= 1');
    }
  }

  recordSuccess(): void {
    this.totalDraws++;
    this.consecutiveFailures = 0;
    this.lastDrawAt = new Date().toISOString();
    this.lastError = null;
  }

  recordFailure(err: unknown): void {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastError = err instanceof Error ? err.message : String(err);
  }

  get failClosed(): boolean {
    return this.consecutiveFailures >= this.maxConsecutiveFailures;
  }

  snapshot(entropy: EntropySource): RngHealth {
    const entropyOk = entropy.healthy?.() ?? true;
    let status: RngHealthStatus = 'ok';
    if (this.failClosed || !entropyOk) {
      status = 'failed';
    } else if (this.totalFailures > 0 && this.consecutiveFailures > 0) {
      status = 'degraded';
    }

    return {
      status,
      checkedAt: new Date().toISOString(),
      algorithm: RNG_ALGORITHM_ID,
      buildId: RNG_BUILD_ID,
      totalDraws: this.totalDraws,
      totalFailures: this.totalFailures,
      consecutiveFailures: this.consecutiveFailures,
      lastDrawAt: this.lastDrawAt,
      lastError: this.lastError,
      failClosed: this.failClosed || !entropyOk,
      details: {
        entropySource: entropy.id,
        maxConsecutiveFailures: this.maxConsecutiveFailures,
        entropyHealthy: entropyOk,
      },
    };
  }
}
