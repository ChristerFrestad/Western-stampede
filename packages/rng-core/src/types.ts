/**
 * Public types for the certifiable RNG core.
 * Independent of game logic — RNG never sees bet, balance, or win state.
 */

export const RNG_ALGORITHM_ID = 'os-csprng+rejection-v1' as const;
export const RNG_BUILD_ID = 'rng-core@1.0.0' as const;

export interface RngProviderMeta {
  /** Human / machine provider id, e.g. "production-csprng". */
  provider: string;
  /** Stable algorithm identifier for lab reports and round records. */
  algorithm: typeof RNG_ALGORITHM_ID | string;
  /** Package / build pin. */
  buildId: typeof RNG_BUILD_ID | string;
  /** Optional stream / session identifier. */
  streamId?: string;
}

export interface RngDrawRequest {
  /** Exclusive upper bound; result in [0, maxExclusive). Must be > 0. */
  maxExclusive: number;
  /** Stable consumer tag, e.g. "reel.stop.2", "feature.stampede". */
  purpose: string;
  /** Correlates draws to a business unit (roundId, pre-round id). */
  correlationId: string;
}

export interface RngDraw {
  drawId: string;
  /** Uniform integer in [0, maxExclusive). */
  value: number;
  maxExclusive: number;
  purpose: string;
  correlationId: string;
  provider: string;
  algorithm: string;
  buildId: string;
  /** SHA-256 hex of the raw entropy bytes consumed for this draw (after rejection loop). */
  rawHash: string;
  /** ISO-8601 timestamp when the draw completed. */
  drawnAt: string;
  /** How many rejection rounds were needed (0 = first candidate accepted). */
  rejections: number;
}

export type RngHealthStatus = 'ok' | 'degraded' | 'failed';

export interface RngHealth {
  status: RngHealthStatus;
  /** Wall-clock ISO time of this health snapshot. */
  checkedAt: string;
  algorithm: string;
  buildId: string;
  /** Total successful draws since process start. */
  totalDraws: number;
  /** Total failed draw attempts (entropy errors, etc.). */
  totalFailures: number;
  /** Consecutive failures; used for fail-closed threshold. */
  consecutiveFailures: number;
  /** Last successful draw time, if any. */
  lastDrawAt: string | null;
  /** Last error message, if any. */
  lastError: string | null;
  /** True when service will refuse new draws (fail-closed). */
  failClosed: boolean;
  details?: Record<string, string | number | boolean>;
}

export interface RngServiceOptions {
  /** Provider label stored on every draw. Default: "production-csprng". */
  provider?: string;
  /** Fail-closed after this many consecutive entropy/draw failures. Default: 3. */
  maxConsecutiveFailures?: number;
  /**
   * Optional hook for durable draw ledger (Postgres, append-only log).
   * Must not throw into the hot path in a way that corrupts money state —
   * callers should treat ledger failures as operational alerts.
   */
  onDraw?: (draw: RngDraw) => void | Promise<void>;
  /**
   * Inject entropy for tests only. Production must use OS CSPRNG.
   * Signature matches node:crypto randomBytes filling.
   */
  entropySource?: EntropySource;
}

/** Fills `target` with cryptographically secure random bytes. */
export interface EntropySource {
  randomBytes(size: number): Uint8Array;
  /** Optional health probe; return false to force fail-closed. */
  healthy?(): boolean;
  id: string;
}
