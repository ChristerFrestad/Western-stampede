import type { SpinResult } from '@ws/shared';
import type { InternalMathConfig } from './config/default-math.js';
import { defaultInternalMath } from './config/default-math.js';
import { mathContentHash } from './math-hash.js';
import type { IRngProvider } from './rng.js';
import { ReplayRng } from './rng.js';
import {
  SpinEngine,
  type SpinEngineInput,
} from './spin-engine.js';

export interface RecordedDraw {
  value: number;
  maxExclusive: number;
  purpose: string;
}

/** Recording RNG: wraps any provider and stores every draw for later replay. */
export class RecordingRng implements IRngProvider {
  readonly simOnly: boolean;
  readonly draws: RecordedDraw[] = [];

  constructor(private readonly inner: IRngProvider) {
    this.simOnly = inner.simOnly ?? false;
  }

  nextInt(maxExclusive: number, purpose = 'unspecified'): number {
    const value = this.inner.nextInt(maxExclusive, purpose);
    this.draws.push({ value, maxExclusive, purpose });
    return value;
  }

  nextInts(
    maxExclusive: number,
    count: number,
    purposePrefix = 'batch',
  ): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.nextInt(maxExclusive, `${purposePrefix}.${i}`));
    }
    return out;
  }

  meta() {
    return this.inner.meta();
  }
}

export interface ReplayVerifyResult {
  ok: boolean;
  mathHashMatch: boolean;
  gridMatch: boolean;
  totalWinMatch: boolean;
  stopsMatch: boolean;
  expectedHash: string;
  actualHash: string;
  details?: string;
}

/**
 * Re-run a spin with recorded draw values and compare critical outcome fields.
 */
export function verifySpinReplay(
  input: SpinEngineInput,
  draws: RecordedDraw[],
  expected: Pick<
    SpinResult,
    'grid' | 'stops' | 'totalWin' | 'mathContentHash' | 'heights' | 'mode'
  >,
  math: InternalMathConfig = defaultInternalMath(),
): ReplayVerifyResult {
  const values = draws.map((d) => d.value);
  const engine = new SpinEngine(math, new ReplayRng(values));
  const out = engine.spinSync(input);
  const actualHash = mathContentHash(math);
  const mathHashMatch =
    !expected.mathContentHash || expected.mathContentHash === actualHash;
  const gridMatch =
    JSON.stringify(out.result.grid) === JSON.stringify(expected.grid);
  const stopsMatch =
    JSON.stringify(out.result.stops) === JSON.stringify(expected.stops);
  const totalWinMatch = out.result.totalWin === expected.totalWin;

  return {
    ok: mathHashMatch && gridMatch && stopsMatch && totalWinMatch,
    mathHashMatch,
    gridMatch,
    totalWinMatch,
    stopsMatch,
    expectedHash: expected.mathContentHash ?? actualHash,
    actualHash,
    details: !totalWinMatch
      ? `totalWin expected=${expected.totalWin} actual=${out.result.totalWin}`
      : undefined,
  };
}

/** Capture draws for one spin. */
export function captureSpinDraws(
  input: SpinEngineInput,
  rng: IRngProvider,
  math: InternalMathConfig = defaultInternalMath(),
): { draws: RecordedDraw[]; output: ReturnType<SpinEngine['spinSync']> } {
  const rec = new RecordingRng(rng);
  const engine = new SpinEngine(math, rec);
  const output = engine.spinSync(input);
  return { draws: rec.draws, output };
}
