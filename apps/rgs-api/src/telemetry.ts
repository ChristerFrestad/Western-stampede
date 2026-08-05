/**
 * Lightweight spin telemetry (OpenTelemetry-compatible shape, zero hard deps).
 * Spans are kept in a ring buffer; optionally exported via OTLP/HTTP JSON.
 */

import { enqueueOtlpSpan, otlpStats } from './otlp-export.js';

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}

const RING = 500;
const spans: Span[] = [];
let spinCount = 0;
let spinErrorCount = 0;
const latencies: number[] = [];

function hexId(bytes: number): string {
  const a = new Uint8Array(bytes);
  // Node 20+ global crypto
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function startSpan(
  name: string,
  attributes: Span['attributes'] = {},
  traceId?: string,
): Span {
  const span: Span = {
    name,
    traceId: traceId ?? hexId(16),
    spanId: hexId(8),
    startMs: performance.now(),
    attributes,
    status: 'ok',
  };
  return span;
}

export function endSpan(span: Span, err?: unknown): Span {
  span.endMs = performance.now();
  span.durationMs = span.endMs - span.startMs;
  if (err) {
    span.status = 'error';
    span.error = err instanceof Error ? err.message : String(err);
  }
  spans.push(span);
  if (spans.length > RING) spans.shift();
  enqueueOtlpSpan(span);

  if (span.name === 'rgs.spin') {
    spinCount++;
    if (span.status === 'error') spinErrorCount++;
    if (span.durationMs != null) {
      latencies.push(span.durationMs);
      if (latencies.length > 2000) latencies.shift();
    }
  }
  return span;
}

export async function withSpinSpan<T>(
  attributes: Span['attributes'],
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = startSpan('rgs.spin', attributes);
  try {
    const result = await fn(span);
    endSpan(span);
    return result;
  } catch (e) {
    endSpan(span, e);
    throw e;
  }
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  ]!;
}

/** Full recent spans for OTLP sample export (admin). */
export function getRecentSpans(n = 20): Span[] {
  return spans.slice(-n).map((s) => ({ ...s, attributes: { ...s.attributes } }));
}

export function telemetrySnapshot() {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    spins: spinCount,
    spinErrors: spinErrorCount,
    successRate: spinCount > 0 ? 1 - spinErrorCount / spinCount : 1,
    latencyMs: {
      p50: Math.round(pct(sorted, 0.5) * 100) / 100,
      p95: Math.round(pct(sorted, 0.95) * 100) / 100,
      p99: Math.round(pct(sorted, 0.99) * 100) / 100,
      samples: sorted.length,
    },
    otlp: otlpStats(),
    recentSpans: spans.slice(-20).map((s) => ({
      name: s.name,
      traceId: s.traceId,
      durationMs: s.durationMs != null ? Math.round(s.durationMs * 100) / 100 : null,
      status: s.status,
      attributes: s.attributes,
      error: s.error,
    })),
  };
}
