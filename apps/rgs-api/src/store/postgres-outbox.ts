import { randomUUID } from 'node:crypto';
import type {
  OutboxJob,
  OutboxJobType,
  OutboxPort,
} from '@ws/wallet-port';

type Querier = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const WALLET_OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS wallet_outbox (
  id           UUID PRIMARY KEY,
  operator_id  UUID,
  type         TEXT NOT NULL,
  player_ref   TEXT NOT NULL,
  amount       BIGINT NOT NULL,
  ref          TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_outbox_pending
  ON wallet_outbox(status, created_at)
  WHERE status = 'pending';
`;

/**
 * Durable outbox for seamless wallet credits (Postgres).
 */
export class PostgresOutbox implements OutboxPort {
  constructor(private readonly q: Querier) {}

  async ensureSchema(): Promise<void> {
    await this.q.query(WALLET_OUTBOX_DDL);
  }

  async enqueue(
    type: OutboxJobType,
    playerRef: string,
    amount: number,
    ref: string,
    operatorId?: string,
  ): Promise<OutboxJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.q.query(
      `INSERT INTO wallet_outbox
       (id, operator_id, type, player_ref, amount, ref, attempts, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending', $7, $7)`,
      [id, operatorId ?? null, type, playerRef, amount, ref, now],
    );
    return {
      id,
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
  }

  async claimPending(max: number): Promise<OutboxJob[]> {
    // SKIP LOCKED for multi-instance workers
    const { rows } = await this.q.query(
      `WITH cte AS (
         SELECT id FROM wallet_outbox
         WHERE status = 'pending'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE wallet_outbox w
       SET status = 'processing',
           attempts = attempts + 1,
           updated_at = now()
       FROM cte
       WHERE w.id = cte.id
       RETURNING w.*`,
      [max],
    );
    return rows.map(mapRow);
  }

  async markDone(id: string): Promise<void> {
    await this.q.query(
      `UPDATE wallet_outbox SET status = 'done', updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async markFailed(id: string, err: string): Promise<void> {
    await this.q.query(
      `UPDATE wallet_outbox
       SET status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
           last_error = $2,
           updated_at = now()
       WHERE id = $1`,
      [id, err.slice(0, 500)],
    );
  }

  async stats() {
    const { rows } = await this.q.query(
      `SELECT status, COUNT(*)::int AS c FROM wallet_outbox GROUP BY status`,
    );
    const by: Record<string, number> = {};
    for (const r of rows) by[String(r.status)] = Number(r.c);
    return {
      total: Object.values(by).reduce((a, b) => a + b, 0),
      pending: by.pending ?? 0,
      failed: by.failed ?? 0,
      done: by.done ?? 0,
    };
  }
}

function mapRow(row: Record<string, unknown>): OutboxJob {
  return {
    id: String(row.id),
    type: row.type as OutboxJobType,
    playerRef: String(row.player_ref),
    amount: Number(row.amount),
    ref: String(row.ref),
    attempts: Number(row.attempts),
    status: row.status as OutboxJob['status'],
    lastError: row.last_error ? String(row.last_error) : undefined,
    operatorId: row.operator_id ? String(row.operator_id) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
