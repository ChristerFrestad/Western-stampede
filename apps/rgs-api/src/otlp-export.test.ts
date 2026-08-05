import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOtlpPayload, toOtlpSpan, otlpStats, otlpEnabled } from './otlp-export.js';
import type { Span } from './telemetry.js';

function sampleSpan(partial: Partial<Span> = {}): Span {
  return {
    name: 'rgs.spin',
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    startMs: 100,
    endMs: 112.5,
    durationMs: 12.5,
    attributes: { bet: 100, ok: true, mode: 'base' },
    status: 'ok',
    ...partial,
  };
}

describe('otlp-export', () => {
  it('converts span to OTLP JSON shape', () => {
    const s = toOtlpSpan(sampleSpan());
    assert.equal(s.name, 'rgs.spin');
    assert.equal(s.traceId, 'a'.repeat(32));
    assert.equal(s.status.code, 1);
    assert.ok(s.attributes.some((a) => a.key === 'bet'));
    assert.ok(String(s.startTimeUnixNano).length > 5);
  });

  it('marks error status and exception attribute', () => {
    const s = toOtlpSpan(
      sampleSpan({ status: 'error', error: 'RNG_UNAVAILABLE' }),
    );
    assert.equal(s.status.code, 2);
    assert.ok(
      s.attributes.some(
        (a) =>
          a.key === 'exception.message' &&
          (a.value as { stringValue?: string }).stringValue === 'RNG_UNAVAILABLE',
      ),
    );
  });

  it('builds resourceSpans payload', () => {
    const payload = buildOtlpPayload([sampleSpan()]);
    assert.equal(payload.resourceSpans.length, 1);
    const scope = payload.resourceSpans[0]!.scopeSpans[0]!;
    assert.equal(scope.spans.length, 1);
    assert.equal(scope.scope.name, 'ws.rgs.telemetry');
  });

  it('reports stats without requiring endpoint', () => {
    const st = otlpStats();
    assert.equal(typeof st.enabled, 'boolean');
    assert.equal(st.enabled, otlpEnabled());
    assert.ok('queued' in st);
  });
});
