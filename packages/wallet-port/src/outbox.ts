import { randomUUID } from 'node:crypto';
import {
  drainOutboxPort,
  type OutboxJob,
  type OutboxJobType,
  type OutboxPort,
} from './outbox-port.js';

export type { OutboxJob, OutboxJobType, OutboxStatus } from './outbox-port.js';
export { drainOutboxPort } from './outbox-port.js';

/**
 * In-memory outbox for win credits that failed operator wallet HTTP.
 */
export class MemoryOutbox implements OutboxPort {
  private jobs = new Map<string, OutboxJob>();

  enqueue(
    type: OutboxJobType,
    playerRef: string,
    amount: number,
    ref: string,
    operatorId?: string,
  ): OutboxJob {
    const now = new Date().toISOString();
    const job: OutboxJob = {
      id: randomUUID(),
      type,
      playerRef,
      amount,
      ref,
      attempts: 0,
      status: 'pending',
      operatorId,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  claimPending(max: number): OutboxJob[] {
    const pending = [...this.jobs.values()]
      .filter((j) => j.status === 'pending')
      .slice(0, max);
    for (const j of pending) {
      j.status = 'processing';
      j.attempts++;
      j.updatedAt = new Date().toISOString();
    }
    return pending;
  }

  markDone(id: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = 'done';
    j.updatedAt = new Date().toISOString();
  }

  markFailed(id: string, err: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = j.attempts >= 8 ? 'failed' : 'pending';
    j.lastError = err;
    j.updatedAt = new Date().toISOString();
  }

  stats() {
    const all = [...this.jobs.values()];
    return {
      total: all.length,
      pending: all.filter((j) => j.status === 'pending').length,
      failed: all.filter((j) => j.status === 'failed').length,
      done: all.filter((j) => j.status === 'done').length,
    };
  }
}

/** @deprecated use drainOutboxPort — kept for callers */
export async function drainOutbox(
  outbox: MemoryOutbox,
  wallet: {
    debit(playerRef: string, amount: number, ref: string): Promise<unknown>;
    credit(playerRef: string, amount: number, ref: string): Promise<unknown>;
  },
  maxJobs = 50,
): Promise<{ processed: number; failed: number }> {
  return drainOutboxPort(outbox, wallet, maxJobs);
}
