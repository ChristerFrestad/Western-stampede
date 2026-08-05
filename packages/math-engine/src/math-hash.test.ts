import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultInternalMath } from './config/default-math.js';
import { canonicalJson, mathContentHash } from './math-hash.js';

describe('mathContentHash', () => {
  it('is stable across calls for the same config', () => {
    const m = defaultInternalMath();
    const h1 = mathContentHash(m);
    const h2 = mathContentHash(m);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  it('changes when a feature weight changes', () => {
    const a = defaultInternalMath();
    const b = defaultInternalMath();
    b.features = { ...b.features, stampedeChance: a.features.stampedeChance + 0.001 };
    assert.notEqual(mathContentHash(a), mathContentHash(b));
  });

  it('canonicalJson sorts object keys', () => {
    assert.equal(
      canonicalJson({ b: 1, a: 2 }),
      canonicalJson({ a: 2, b: 1 }),
    );
  });
});
