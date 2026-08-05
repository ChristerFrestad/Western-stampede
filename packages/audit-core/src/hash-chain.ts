import { createHash } from 'node:crypto';

export interface AuditEventInput {
  type: string;
  payload: unknown;
  at?: string;
}

export interface ChainedAuditEvent {
  seq: number;
  type: string;
  payload: unknown;
  at: string;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

/**
 * Append-only hash chain for regulatory / security events.
 * Each event hash = SHA-256(seq | prevHash | type | at | canonical payload).
 */
export class HashChain {
  private seq = 0;
  private prevHash = GENESIS;
  private readonly events: ChainedAuditEvent[] = [];

  get length(): number {
    return this.events.length;
  }

  get tip(): string {
    return this.prevHash;
  }

  append(input: AuditEventInput): ChainedAuditEvent {
    this.seq += 1;
    const at = input.at ?? new Date().toISOString();
    const payloadJson = stableStringify(input.payload);
    const material = `${this.seq}|${this.prevHash}|${input.type}|${at}|${payloadJson}`;
    const hash = createHash('sha256').update(material).digest('hex');
    const event: ChainedAuditEvent = {
      seq: this.seq,
      type: input.type,
      payload: input.payload,
      at,
      prevHash: this.prevHash,
      hash,
    };
    this.prevHash = hash;
    this.events.push(event);
    return event;
  }

  verify(): { ok: boolean; brokenAt?: number } {
    let prev = GENESIS;
    for (const e of this.events) {
      if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq };
      const payloadJson = stableStringify(e.payload);
      const material = `${e.seq}|${e.prevHash}|${e.type}|${e.at}|${payloadJson}`;
      const hash = createHash('sha256').update(material).digest('hex');
      if (hash !== e.hash) return { ok: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { ok: true };
  }

  toArray(): readonly ChainedAuditEvent[] {
    return this.events;
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeys(obj[k]);
  }
  return out;
}
