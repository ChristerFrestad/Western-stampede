import { randomUUID } from 'node:crypto';
import { OsCspongeEntropy } from './entropy.js';
import { HealthTracker } from './health.js';
import { hashRawBytes, unbiasedInt } from './unbiased-int.js';
import {
  RNG_ALGORITHM_ID,
  RNG_BUILD_ID,
  type EntropySource,
  type RngDraw,
  type RngDrawRequest,
  type RngHealth,
  type RngProviderMeta,
  type RngServiceOptions,
} from './types.js';

/**
 * Production RNG service — isolatable certification unit.
 *
 * Draw path is **synchronous** (Node `randomBytes` is sync) so the hot spin
 * path and Monte Carlo harness avoid Promise overhead on multi-core hosts.
 */
export class RngService {
  private readonly provider: string;
  private readonly entropy: EntropySource;
  private readonly healthTracker: HealthTracker;
  private readonly onDraw?: RngServiceOptions['onDraw'];

  constructor(options: RngServiceOptions = {}) {
    this.provider = options.provider ?? 'production-csprng';
    this.entropy = options.entropySource ?? new OsCspongeEntropy();
    this.healthTracker = new HealthTracker(options.maxConsecutiveFailures ?? 3);
    this.onDraw = options.onDraw;
  }

  meta(streamId?: string): RngProviderMeta {
    return {
      provider: this.provider,
      algorithm: RNG_ALGORITHM_ID,
      buildId: RNG_BUILD_ID,
      streamId,
    };
  }

  health(): RngHealth {
    return this.healthTracker.snapshot(this.entropy);
  }

  assertAvailable(): void {
    const h = this.health();
    if (h.failClosed || h.status === 'failed') {
      throw new Error('RNG_UNAVAILABLE');
    }
  }

  /** Synchronous draw — preferred for game engine and lab harness. */
  drawSync(req: RngDrawRequest): RngDraw {
    this.assertAvailable();
    this.validateRequest(req);

    try {
      const result = unbiasedInt(this.entropy, req.maxExclusive);
      const draw: RngDraw = {
        drawId: randomUUID(),
        value: result.value,
        maxExclusive: req.maxExclusive,
        purpose: req.purpose,
        correlationId: req.correlationId,
        provider: this.provider,
        algorithm: RNG_ALGORITHM_ID,
        buildId: RNG_BUILD_ID,
        rawHash: hashRawBytes(result.rawBytes),
        drawnAt: new Date().toISOString(),
        rejections: result.rejections,
      };
      this.healthTracker.recordSuccess();
      if (this.onDraw) {
        // Fire-and-forget async ledger; never block the draw hot path.
        void Promise.resolve(this.onDraw(draw)).catch(() => {
          /* ledger failures must not break money path; monitor separately */
        });
      }
      return draw;
    } catch (err) {
      this.healthTracker.recordFailure(err);
      throw err instanceof Error ? err : new Error('RNG_DRAW_FAILED');
    }
  }

  async draw(req: RngDrawRequest): Promise<RngDraw> {
    return this.drawSync(req);
  }

  async drawMany(reqs: RngDrawRequest[]): Promise<RngDraw[]> {
    return reqs.map((req) => this.drawSync(req));
  }

  openStream(correlationId: string): RngStream {
    if (!correlationId || correlationId.length > 128) {
      throw new Error('RNG_INVALID_CORRELATION_ID');
    }
    return new RngStream(this, correlationId);
  }

  private validateRequest(req: RngDrawRequest): void {
    if (!Number.isSafeInteger(req.maxExclusive) || req.maxExclusive <= 0) {
      throw new Error('RNG_INVALID_RANGE');
    }
    if (!req.purpose || req.purpose.length > 128) {
      throw new Error('RNG_INVALID_PURPOSE');
    }
    if (!req.correlationId || req.correlationId.length > 128) {
      throw new Error('RNG_INVALID_CORRELATION_ID');
    }
  }
}

/**
 * Per-round RNG stream used by the math engine.
 */
export class RngStream {
  private readonly draws: RngDraw[] = [];

  constructor(
    private readonly service: RngService,
    readonly correlationId: string,
  ) {}

  nextInt(maxExclusive: number, purpose = 'unspecified'): number {
    const draw = this.service.drawSync({
      maxExclusive,
      purpose,
      correlationId: this.correlationId,
    });
    this.draws.push(draw);
    return draw.value;
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix = 'batch',
  ): number[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('RNG_INVALID_COUNT');
    }
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.nextInt(maxExclusive, `${purposePrefix}.${i}`));
    }
    return out;
  }

  getDraws(): readonly RngDraw[] {
    return this.draws;
  }

  drawIds(): string[] {
    return this.draws.map((d) => d.drawId);
  }

  meta() {
    const base = this.service.meta(this.correlationId);
    return {
      ...base,
      streamId: this.correlationId,
      drawIds: this.drawIds(),
      drawCount: this.draws.length,
    };
  }
}
