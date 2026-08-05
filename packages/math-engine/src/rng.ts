import {
  RngService,
  RngStream,
  SeededEntropy,
  type RngDraw,
} from '@ws/rng-core';
import type { RngMeta } from '@ws/shared';
import { pcg64NextInt, pcg64Seed } from './pcg64.js';

export const SIM_ONLY_ALGORITHMS = new Set([
  'pcg64-xsl-rr-sim-only',
  'mulberry32-sim-only',
  'test-sequence',
  'replay-sequence',
]);

/**
 * Synchronous RNG API — Node CSPRNG and PCG are both sync.
 * Prefer sync for engine + multi-million spin Monte Carlo on multi-core hosts.
 */
export interface IRngProvider {
  nextInt(maxExclusive: number, purpose?: string): number;
  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix?: string,
  ): number[];
  meta(): RngMeta;
  readonly simOnly?: boolean;
}

export function assertProductionRng(rng: IRngProvider): void {
  if (rng.simOnly) {
    throw new Error('SIM_RNG_FORBIDDEN_IN_PRODUCTION');
  }
  const alg = rng.meta().algorithm;
  if (alg && SIM_ONLY_ALGORITHMS.has(alg)) {
    throw new Error('SIM_RNG_FORBIDDEN_IN_PRODUCTION');
  }
}

export class StreamRngAdapter implements IRngProvider {
  readonly simOnly = false;

  constructor(private readonly stream: RngStream) {}

  nextInt(maxExclusive: number, purpose = 'unspecified'): number {
    return this.stream.nextInt(maxExclusive, purpose);
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix = 'batch',
  ): number[] {
    return this.stream.nextInts(maxExclusive, count, purposePrefix);
  }

  meta(): RngMeta {
    return this.stream.meta();
  }

  getDraws(): readonly RngDraw[] {
    return this.stream.getDraws();
  }
}

export class CryptoPrng implements IRngProvider {
  readonly simOnly = false;
  private readonly service: RngService;
  private stream: RngStream;

  constructor(correlationId = 'unscoped') {
    this.service = new RngService({ provider: 'local-crypto' });
    this.stream = this.service.openStream(correlationId);
  }

  beginRound(correlationId: string): void {
    this.stream = this.service.openStream(correlationId);
  }

  health() {
    return this.service.health();
  }

  assertAvailable(): void {
    this.service.assertAvailable();
  }

  nextInt(maxExclusive: number, purpose = 'unspecified'): number {
    return this.stream.nextInt(maxExclusive, purpose);
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix = 'batch',
  ): number[] {
    return this.stream.nextInts(maxExclusive, count, purposePrefix);
  }

  meta(): RngMeta {
    return this.stream.meta();
  }

  getDraws(): readonly RngDraw[] {
    return this.stream.getDraws();
  }
}

export function createProductionStream(
  correlationId: string,
  options?: ConstructorParameters<typeof RngService>[0],
): { service: RngService; stream: RngStream; adapter: StreamRngAdapter } {
  const service = new RngService({
    provider: 'production-csprng',
    ...options,
  });
  service.assertAvailable();
  const stream = service.openStream(correlationId);
  return { service, stream, adapter: new StreamRngAdapter(stream) };
}

export class SequenceRng implements IRngProvider {
  readonly simOnly = true;
  private i = 0;
  constructor(private readonly values: number[]) {}

  meta(): RngMeta {
    return {
      provider: 'sequence',
      streamId: `seq-${this.values.length}`,
      algorithm: 'test-sequence',
      buildId: 'test',
    };
  }

  nextInt(maxExclusive: number, _purpose?: string): number {
    if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
    const v = this.values[this.i % this.values.length]!;
    this.i++;
    return v % maxExclusive;
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix?: string,
  ): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.nextInt(maxExclusive, `${purposePrefix ?? 'batch'}.${i}`));
    }
    return out;
  }
}

/**
 * Replay RNG: exact draw values in order (for round verification).
 * Each call consumes the next pre-recorded value; ignores maxExclusive except bounds check.
 */
export class ReplayRng implements IRngProvider {
  readonly simOnly = true;
  private i = 0;

  constructor(private readonly values: number[]) {}

  meta(): RngMeta {
    return {
      provider: 'replay',
      streamId: `replay-${this.values.length}`,
      algorithm: 'replay-sequence',
      buildId: 'verify',
      drawCount: this.i,
    };
  }

  nextInt(maxExclusive: number, _purpose?: string): number {
    if (this.i >= this.values.length) {
      throw new Error('REPLAY_EXHAUSTED');
    }
    const v = this.values[this.i++]!;
    if (v < 0 || v >= maxExclusive) {
      throw new Error(
        `REPLAY_OUT_OF_RANGE: value=${v} maxExclusive=${maxExclusive} at index ${this.i - 1}`,
      );
    }
    return v;
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix?: string,
  ): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.nextInt(maxExclusive, `${purposePrefix ?? 'batch'}.${i}`));
    }
    return out;
  }

  remaining(): number {
    return this.values.length - this.i;
  }
}

/**
 * PCG64 for mass simulation ONLY.
 */
export class SeededPrng implements IRngProvider {
  readonly simOnly = true;
  private state: bigint;

  constructor(seed: number | bigint) {
    this.state = pcg64Seed(seed);
  }

  meta(): RngMeta {
    return {
      provider: 'seeded-sim',
      streamId: this.state.toString(16).slice(0, 16),
      algorithm: 'pcg64-xsl-rr-sim-only',
      buildId: 'sim',
    };
  }

  nextInt(maxExclusive: number, _purpose?: string): number {
    const r = pcg64NextInt(this.state, maxExclusive);
    this.state = r.state;
    return r.value;
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix?: string,
  ): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.nextInt(maxExclusive, `${purposePrefix ?? 'batch'}.${i}`));
    }
    return out;
  }
}

export const Pcg64SimPrng = SeededPrng;

export function createTestCspongeStream(
  correlationId: string,
  seed: number,
): StreamRngAdapter {
  const service = new RngService({
    provider: 'test-csprng-path',
    entropySource: new SeededEntropy(seed),
  });
  return new StreamRngAdapter(service.openStream(correlationId));
}

export type { RngDraw, RngHealth, RngService } from '@ws/rng-core';
export { RngService as ProductionRngService } from '@ws/rng-core';
