/**
 * Shared outbox contract for memory + Postgres implementations.
 */
export type OutboxJobType = 'wallet.credit' | 'wallet.debit';
export type OutboxStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface OutboxJob {
  id: string;
  type: OutboxJobType;
  playerRef: string;
  amount: number;
  ref: string;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  operatorId?: string;
}

export interface OutboxPort {
  enqueue(
    type: OutboxJobType,
    playerRef: string,
    amount: number,
    ref: string,
    operatorId?: string,
  ): Promise<OutboxJob> | OutboxJob;
  claimPending(max: number): Promise<OutboxJob[]> | OutboxJob[];
  markDone(id: string): Promise<void> | void;
  markFailed(id: string, err: string): Promise<void> | void;
  stats():
    | Promise<{ total: number; pending: number; failed: number; done: number }>
    | { total: number; pending: number; failed: number; done: number };
}

export async function drainOutboxPort(
  outbox: OutboxPort,
  wallet: {
    debit(playerRef: string, amount: number, ref: string): Promise<unknown>;
    credit(playerRef: string, amount: number, ref: string): Promise<unknown>;
  },
  maxJobs = 50,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const jobs = await Promise.resolve(outbox.claimPending(maxJobs));
  for (const job of jobs) {
    try {
      if (job.type === 'wallet.credit') {
        await wallet.credit(job.playerRef, job.amount, job.ref);
      } else {
        await wallet.debit(job.playerRef, job.amount, job.ref);
      }
      await Promise.resolve(outbox.markDone(job.id));
      processed++;
    } catch (e) {
      await Promise.resolve(
        outbox.markFailed(
          job.id,
          e instanceof Error ? e.message : String(e),
        ),
      );
      failed++;
    }
  }
  return { processed, failed };
}
