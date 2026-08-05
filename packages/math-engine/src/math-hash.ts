import { createHash } from 'node:crypto';
import type { InternalMathConfig } from './config/default-math.js';

/**
 * Canonical JSON: stable key order (recursive sort) so the same config
 * always yields the same SHA-256 regardless of object insertion order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

/** SHA-256 hex of the full internal math config (strips, paytable, features, …). */
export function mathContentHash(math: InternalMathConfig): string {
  return createHash('sha256').update(canonicalJson(math)).digest('hex');
}
