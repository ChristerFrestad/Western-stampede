import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CryptoPrng,
  SeededPrng,
  SequenceRng,
  assertProductionRng,
} from './rng.js';

describe('assertProductionRng', () => {
  it('allows CryptoPrng', () => {
    assert.doesNotThrow(() => assertProductionRng(new CryptoPrng('t')));
  });

  it('blocks SeededPrng (PCG sim)', () => {
    assert.throws(
      () => assertProductionRng(new SeededPrng(1)),
      /SIM_RNG_FORBIDDEN_IN_PRODUCTION/,
    );
  });

  it('blocks SequenceRng', () => {
    assert.throws(
      () => assertProductionRng(new SequenceRng([1, 2, 3])),
      /SIM_RNG_FORBIDDEN_IN_PRODUCTION/,
    );
  });
});
