import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { endSpan, startSpan, telemetrySnapshot, withSpinSpan } from './telemetry.js';

describe('telemetry', () => {
  it('records spin span latency', async () => {
    const before = telemetrySnapshot().spins;
    await withSpinSpan({ bet: 100 }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 1;
    });
    const snap = telemetrySnapshot();
    assert.ok(snap.spins >= before + 1);
    assert.ok(snap.latencyMs.samples >= 1);
  });

  it('marks error spans', () => {
    const s = startSpan('test.err', { x: 1 });
    endSpan(s, new Error('boom'));
    assert.equal(s.status, 'error');
    assert.equal(s.error, 'boom');
  });
});
