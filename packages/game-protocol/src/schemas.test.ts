import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROTOCOL_VERSION,
  spinRequestSchema,
  spinResultSchema,
} from './schemas.js';
import { buildOpenApiDocument } from './openapi.js';

describe('game-protocol schemas', () => {
  it('accepts valid spin request', () => {
    const r = spinRequestSchema.parse({
      bet: 100,
      clientRoundId: 'abc-1',
      buyTier: 'standard',
    });
    assert.equal(r.bet, 100);
  });

  it('rejects bad spin request', () => {
    assert.throws(() =>
      spinRequestSchema.parse({ bet: -1, clientRoundId: 'x' }),
    );
  });

  it('validates spin result shape', () => {
    const result = spinResultSchema.parse({
      roundId: 'r1',
      mathVersion: 'western-stampede-1.2.0',
      mathContentHash: 'a'.repeat(64),
      mode: 'BASE',
      bet: 100,
      grid: [['9', '10']],
      heights: [4, 6, 6, 6, 4],
      stops: [0, 1, 2, 3, 4],
      wins: [],
      totalWin: 0,
      balance: 900,
      features: {},
      wildMults: [],
      rngMeta: {
        provider: 'production-csprng',
        algorithm: 'os-csprng+rejection-v1',
        drawIds: ['d1'],
      },
    });
    assert.equal(result.roundId, 'r1');
  });

  it('openapi document includes protocol version', () => {
    const doc = buildOpenApiDocument();
    assert.equal(doc['x-ws-protocol-version'], PROTOCOL_VERSION);
    assert.ok(doc.paths['/api/v1/game/spin']);
  });
});
