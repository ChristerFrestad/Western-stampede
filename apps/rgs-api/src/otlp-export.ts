/**
 * Optional OTLP/HTTP JSON span export (no SDK dependency).
 * Set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 * Optional: OTEL_SERVICE_NAME=western-stampede-rgs
 */
import type { Span } from './telemetry.js';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, '');
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'western-stampede-rgs';
const enabled = Boolean(endpoint);

/** Convert internal span to OTLP JSON span (simplified). */
export function toOtlpSpan(span: Span) {
  const startNano = BigInt(Math.floor(span.startMs * 1e6));
  const endNano = BigInt(
    Math.floor((span.endMs ?? span.startMs) * 1e6),
  );
  const attrs = Object.entries(span.attributes).map(([key, value]) => {
    if (typeof value === 'number') {
      return {
        key,
        value: Number.isInteger(value)
          ? { intValue: String(value) }
          : { doubleValue: value },
      };
    }
    if (typeof value === 'boolean') {
      return { key, value: { boolValue: value } };
    }
    return { key, value: { stringValue: String(value) } };
  });
  if (span.error) {
    attrs.push({ key: 'exception.message', value: { stringValue: span.error } });
  }
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.name,
    kind: 2, // SERVER
    startTimeUnixNano: startNano.toString(),
    endTimeUnixNano: endNano.toString(),
    attributes: attrs,
    status: {
      code: span.status === 'error' ? 2 : 1,
      message: span.error ?? '',
    },
  };
}

export function buildOtlpPayload(batch: Span[]) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            {
              key: 'service.version',
              value: { stringValue: process.env.npm_package_version ?? '1.0.0' },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'ws.rgs.telemetry', version: '1.0.0' },
            spans: batch.map(toOtlpSpan),
          },
        ],
      },
    ],
  };
}

let queue: Span[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let exportCount = 0;
let exportErrors = 0;

export function otlpEnabled(): boolean {
  return enabled;
}

export function otlpStats() {
  return {
    enabled,
    endpoint: endpoint ?? null,
    serviceName,
    queued: queue.length,
    exportCount,
    exportErrors,
  };
}

export function enqueueOtlpSpan(span: Span): void {
  if (!enabled) return;
  queue.push(span);
  if (queue.length >= 32) void flushOtlp();
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      void flushOtlp();
    }, 2000);
    // unref so process can exit in tests
    flushTimer.unref?.();
  }
}

export async function flushOtlp(): Promise<void> {
  if (!enabled || queue.length === 0) return;
  const batch = queue.splice(0, 64);
  const url = `${endpoint}/v1/traces`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildOtlpPayload(batch)),
    });
    if (!res.ok) {
      exportErrors++;
      // re-queue small batch on failure (best effort)
      if (batch.length < 16) queue.unshift(...batch);
    } else {
      exportCount++;
    }
  } catch {
    exportErrors++;
    if (batch.length < 16) queue.unshift(...batch);
  }
}
