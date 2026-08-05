/**
 * Postgres-backed multi-tenant IStore — production durable path.
 */
import { randomUUID } from 'node:crypto';
import type { FreeGameSession } from '@ws/math-engine';
import type { SpinResult } from '@ws/shared';
import { hashApiKey } from './memory-store.js';
import type {
  IStore,
  Operator,
  Player,
  Session,
  StoredRound,
  TopUpIntent,
} from './types.js';
import { DEMO_OPERATOR_CODE, DEMO_OPERATOR_ID } from './types.js';

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

type Querier = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS operators (
  id            UUID PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL,
  wallet_mode   TEXT NOT NULL DEFAULT 'demo',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY,
  operator_id   UUID NOT NULL REFERENCES operators(id),
  external_ref  TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  balance       BIGINT NOT NULL CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INT NOT NULL DEFAULT 0,
  UNIQUE (operator_id, external_ref)
);
CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES players(id),
  operator_id   UUID NOT NULL REFERENCES operators(id),
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID PRIMARY KEY,
  operator_id   UUID NOT NULL REFERENCES operators(id),
  player_id     UUID NOT NULL REFERENCES players(id),
  type          TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  ref           TEXT NOT NULL,
  balance_after BIGINT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger_entries(player_id, at DESC);
CREATE TABLE IF NOT EXISTS rounds (
  id              UUID PRIMARY KEY,
  operator_id     UUID NOT NULL REFERENCES operators(id),
  player_id       UUID NOT NULL REFERENCES players(id),
  client_round_id TEXT NOT NULL,
  result          JSONB NOT NULL,
  debit           BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, client_round_id)
);
CREATE INDEX IF NOT EXISTS idx_rounds_operator ON rounds(operator_id, created_at DESC);
CREATE TABLE IF NOT EXISTS free_sessions (
  player_id   UUID PRIMARY KEY REFERENCES players(id),
  session     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS topup_intents (
  id          UUID PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES operators(id),
  player_id   UUID NOT NULL REFERENCES players(id),
  amount      BIGINT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

class TxStore implements IStore {
  readonly kind = 'postgres' as const;
  constructor(
    private readonly client: PgClient,
    private readonly parent: PostgresStore,
  ) {}

  ensureDemoOperator = () => this.parent.ensureDemoOperator();
  getOperatorByCode = (c: string) => this.parent.getOperatorByCode(c);
  getOperatorById = (id: string) => this.parent.getOperatorById(id);
  getOperatorByApiKeyHash = (h: string) => this.parent.getOperatorByApiKeyHash(h);
  createOperator = (i: Parameters<IStore['createOperator']>[0]) =>
    this.parent.createOperator(i);
  rotateOperatorApiKey = (code: string, hash: string) =>
    this.parent.rotateOperatorApiKey(code, hash);
  createGuest = () => Promise.reject(new Error('TX_CREATE_GUEST_UNSUPPORTED'));
  createOperatorSession = () =>
    Promise.reject(new Error('TX_CREATE_SESSION_UNSUPPORTED'));

  getSession(token: string) {
    return getSessionWith(this.client, token);
  }
  getPlayer(id: string) {
    return getPlayerWith(this.client, id);
  }
  debit(playerId: string, amount: number, ref: string) {
    return debitWith(this.client, playerId, amount, ref);
  }
  credit(playerId: string, amount: number, ref: string) {
    return creditWith(this.client, playerId, amount, ref);
  }
  saveRound(round: StoredRound) {
    return saveRoundWith(this.client, round);
  }
  findByClientRound(playerId: string, clientRoundId: string) {
    return findByClientRoundWith(this.client, playerId, clientRoundId);
  }
  getRound(id: string) {
    return getRoundWith(this.client, id);
  }
  getRoundForOperator(operatorId: string, roundId: string) {
    return getRoundForOperatorWith(this.client, operatorId, roundId);
  }
  listRounds(playerId: string, limit: number) {
    return listRoundsWith(this.client, playerId, limit);
  }
  getFreeSession(playerId: string) {
    return getFreeSessionWith(this.client, playerId);
  }
  setFreeSession(playerId: string, session: FreeGameSession | null) {
    return setFreeSessionWith(this.client, playerId, session);
  }
  saveTopUp(intent: TopUpIntent) {
    return saveTopUpWith(this.client, intent);
  }
  metrics() {
    return Promise.resolve({ rounds: 0, players: 0, wagered: 0, won: 0 });
  }
  ready() {
    return this.client.query('SELECT 1').then(() => true);
  }
}

export class PostgresStore implements IStore {
  readonly kind = 'postgres' as const;

  constructor(private readonly pool: PgPool) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: databaseUrl, max: 20 });
    const store = new PostgresStore(pool as unknown as PgPool);
    await store.migrate();
    return store;
  }

  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async ensureDemoOperator(): Promise<Operator> {
    const existing = await this.getOperatorById(DEMO_OPERATOR_ID);
    if (existing) return existing;
    const op: Operator = {
      id: DEMO_OPERATOR_ID,
      code: DEMO_OPERATOR_CODE,
      name: 'Demo Operator',
      apiKeyHash: hashApiKey('demo-api-key-change-me'),
      walletMode: 'demo',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await this.pool.query(
      `INSERT INTO operators (id, code, name, api_key_hash, wallet_mode, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        op.id,
        op.code,
        op.name,
        op.apiKeyHash,
        op.walletMode,
        op.status,
        op.createdAt,
      ],
    );
    return (await this.getOperatorById(DEMO_OPERATOR_ID))!;
  }

  async getOperatorByCode(code: string): Promise<Operator | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM operators WHERE code = $1`,
      [code],
    );
    return rows[0] ? mapOperator(rows[0]) : undefined;
  }

  async getOperatorById(id: string): Promise<Operator | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM operators WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapOperator(rows[0]) : undefined;
  }

  async getOperatorByApiKeyHash(hash: string): Promise<Operator | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM operators WHERE api_key_hash = $1`,
      [hash],
    );
    return rows[0] ? mapOperator(rows[0]) : undefined;
  }

  async createOperator(input: {
    code: string;
    name: string;
    apiKeyHash: string;
    walletMode?: Operator['walletMode'];
  }): Promise<Operator> {
    const op: Operator = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      apiKeyHash: input.apiKeyHash,
      walletMode: input.walletMode ?? 'demo',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    try {
      await this.pool.query(
        `INSERT INTO operators (id, code, name, api_key_hash, wallet_mode, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          op.id,
          op.code,
          op.name,
          op.apiKeyHash,
          op.walletMode,
          op.status,
          op.createdAt,
        ],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        throw new Error('OPERATOR_CODE_EXISTS');
      }
      throw e;
    }
    return op;
  }

  async rotateOperatorApiKey(
    code: string,
    newApiKeyHash: string,
  ): Promise<Operator> {
    const res = await this.pool.query(
      `UPDATE operators SET api_key_hash = $2 WHERE code = $1 RETURNING *`,
      [code, newApiKeyHash],
    );
    if (!res.rowCount) throw new Error('OPERATOR_NOT_FOUND');
    return mapOperator(res.rows[0]!);
  }

  async createGuest(
    startBalance: number,
    operatorId?: string,
  ): Promise<{ player: Player; token: string }> {
    await this.ensureDemoOperator();
    const opId = operatorId ?? DEMO_OPERATOR_ID;
    const id = randomUUID();
    const token = randomUUID();
    const createdAt = new Date().toISOString();
    const externalRef = `guest-${id.slice(0, 8)}`;
    const displayName = `Guest-${id.slice(0, 6)}`;
    await this.pool.query(
      `INSERT INTO players (id, operator_id, external_ref, display_name, balance, created_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [id, opId, externalRef, displayName, startBalance, createdAt],
    );
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await this.pool.query(
      `INSERT INTO sessions (token, player_id, operator_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [token, id, opId, expires],
    );
    return {
      player: {
        id,
        operatorId: opId,
        externalRef,
        displayName,
        balance: startBalance,
        createdAt,
        version: 0,
      },
      token,
    };
  }

  async createOperatorSession(input: {
    operatorId: string;
    externalRef: string;
    displayName?: string;
    startBalance?: number;
  }): Promise<{ player: Player; token: string }> {
    const op = await this.getOperatorById(input.operatorId);
    if (!op || op.status !== 'active') throw new Error('OPERATOR_INVALID');

    let player = await this.findPlayerByExternal(
      input.operatorId,
      input.externalRef,
    );
    if (!player) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      await this.pool.query(
        `INSERT INTO players (id, operator_id, external_ref, display_name, balance, created_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, 0)`,
        [
          id,
          input.operatorId,
          input.externalRef,
          input.displayName ?? input.externalRef,
          input.startBalance ?? 0,
          createdAt,
        ],
      );
      player = (await this.getPlayer(id))!;
    }

    const token = randomUUID();
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await this.pool.query(
      `INSERT INTO sessions (token, player_id, operator_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [token, player.id, input.operatorId, expires],
    );
    return { player, token };
  }

  private async findPlayerByExternal(
    operatorId: string,
    externalRef: string,
  ): Promise<Player | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM players WHERE operator_id = $1 AND external_ref = $2`,
      [operatorId, externalRef],
    );
    return rows[0] ? mapPlayer(rows[0]) : undefined;
  }

  getSession(token: string) {
    return getSessionWith(this.pool, token);
  }
  getPlayer(id: string) {
    return getPlayerWith(this.pool, id);
  }
  debit(playerId: string, amount: number, ref: string) {
    return debitWith(this.pool, playerId, amount, ref);
  }
  credit(playerId: string, amount: number, ref: string) {
    return creditWith(this.pool, playerId, amount, ref);
  }
  saveRound(round: StoredRound) {
    return saveRoundWith(this.pool, round);
  }
  findByClientRound(playerId: string, clientRoundId: string) {
    return findByClientRoundWith(this.pool, playerId, clientRoundId);
  }
  getRound(id: string) {
    return getRoundWith(this.pool, id);
  }
  getRoundForOperator(operatorId: string, roundId: string) {
    return getRoundForOperatorWith(this.pool, operatorId, roundId);
  }
  listRounds(playerId: string, limit: number) {
    return listRoundsWith(this.pool, playerId, limit);
  }
  getFreeSession(playerId: string) {
    return getFreeSessionWith(this.pool, playerId);
  }
  setFreeSession(playerId: string, session: FreeGameSession | null) {
    return setFreeSessionWith(this.pool, playerId, session);
  }
  saveTopUp(intent: TopUpIntent) {
    return saveTopUpWith(this.pool, intent);
  }

  async metrics(operatorId?: string) {
    if (operatorId) {
      const rounds = await this.pool.query(
        `SELECT COUNT(*)::int AS c FROM rounds WHERE operator_id = $1`,
        [operatorId],
      );
      const players = await this.pool.query(
        `SELECT COUNT(*)::int AS c FROM players WHERE operator_id = $1`,
        [operatorId],
      );
      const sums = await this.pool.query(
        `SELECT COALESCE(SUM(debit),0)::bigint AS wagered,
                COALESCE(SUM((result->>'totalWin')::bigint),0)::bigint AS won
         FROM rounds WHERE operator_id = $1`,
        [operatorId],
      );
      return {
        rounds: Number(rounds.rows[0]?.c ?? 0),
        players: Number(players.rows[0]?.c ?? 0),
        wagered: Number(sums.rows[0]?.wagered ?? 0),
        won: Number(sums.rows[0]?.won ?? 0),
      };
    }
    const rounds = await this.pool.query(`SELECT COUNT(*)::int AS c FROM rounds`);
    const players = await this.pool.query(
      `SELECT COUNT(*)::int AS c FROM players`,
    );
    const sums = await this.pool.query(
      `SELECT COALESCE(SUM(debit),0)::bigint AS wagered,
              COALESCE(SUM((result->>'totalWin')::bigint),0)::bigint AS won
       FROM rounds`,
    );
    return {
      rounds: Number(rounds.rows[0]?.c ?? 0),
      players: Number(players.rows[0]?.c ?? 0),
      wagered: Number(sums.rows[0]?.wagered ?? 0),
      won: Number(sums.rows[0]?.won ?? 0),
    };
  }

  async ready(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }

  async runSpinTransaction(
    fn: (tx: IStore) => Promise<SpinResult>,
  ): Promise<SpinResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new TxStore(client, this));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

function mapOperator(row: Record<string, unknown>): Operator {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    apiKeyHash: String(row.api_key_hash),
    walletMode: row.wallet_mode as Operator['walletMode'],
    status: row.status as Operator['status'],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    operatorId: String(row.operator_id),
    externalRef: String(row.external_ref),
    displayName: String(row.display_name),
    balance: Number(row.balance),
    createdAt: new Date(String(row.created_at)).toISOString(),
    version: Number(row.version),
  };
}

function mapRound(row: Record<string, unknown>): StoredRound {
  const result =
    typeof row.result === 'string'
      ? (JSON.parse(row.result) as SpinResult)
      : (row.result as SpinResult);
  return {
    id: String(row.id),
    operatorId: String(row.operator_id),
    playerId: String(row.player_id),
    clientRoundId: String(row.client_round_id),
    result,
    debit: Number(row.debit),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

async function getSessionWith(
  q: Querier,
  token: string,
): Promise<Session | undefined> {
  const { rows } = await q.query(
    `SELECT token, player_id, operator_id, expires_at FROM sessions WHERE token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return undefined;
  const expiresAt = new Date(String(row.expires_at)).getTime();
  if (expiresAt < Date.now()) {
    await q.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    return undefined;
  }
  return {
    token: String(row.token),
    playerId: String(row.player_id),
    operatorId: String(row.operator_id),
    expiresAt,
  };
}

async function getPlayerWith(
  q: Querier,
  id: string,
): Promise<Player | undefined> {
  const { rows } = await q.query(`SELECT * FROM players WHERE id = $1`, [id]);
  return rows[0] ? mapPlayer(rows[0]) : undefined;
}

async function debitWith(
  q: Querier,
  playerId: string,
  amount: number,
  ref: string,
): Promise<Player> {
  if (amount < 0) throw new Error('INVALID_AMOUNT');
  await q.query(`SELECT id FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
  const { rows } = await q.query(
    `UPDATE players SET balance = balance - $2, version = version + 1
     WHERE id = $1 AND balance >= $2
     RETURNING *`,
    [playerId, amount],
  );
  if (!rows[0]) {
    const p = await getPlayerWith(q, playerId);
    if (!p) throw new Error('PLAYER_NOT_FOUND');
    throw new Error('INSUFFICIENT_FUNDS');
  }
  const p = mapPlayer(rows[0]);
  await q.query(
    `INSERT INTO ledger_entries (id, operator_id, player_id, type, amount, ref, balance_after)
     VALUES ($1, $2, $3, 'debit', $4, $5, $6)`,
    [randomUUID(), p.operatorId, playerId, -amount, ref, p.balance],
  );
  return p;
}

async function creditWith(
  q: Querier,
  playerId: string,
  amount: number,
  ref: string,
): Promise<Player> {
  if (amount < 0) throw new Error('INVALID_AMOUNT');
  await q.query(`SELECT id FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
  const { rows } = await q.query(
    `UPDATE players SET balance = balance + $2, version = version + 1
     WHERE id = $1 RETURNING *`,
    [playerId, amount],
  );
  if (!rows[0]) throw new Error('PLAYER_NOT_FOUND');
  const p = mapPlayer(rows[0]);
  await q.query(
    `INSERT INTO ledger_entries (id, operator_id, player_id, type, amount, ref, balance_after)
     VALUES ($1, $2, $3, 'credit', $4, $5, $6)`,
    [randomUUID(), p.operatorId, playerId, amount, ref, p.balance],
  );
  return p;
}

async function saveRoundWith(q: Querier, round: StoredRound): Promise<void> {
  await q.query(
    `INSERT INTO rounds (id, operator_id, player_id, client_round_id, result, debit, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (player_id, client_round_id) DO NOTHING`,
    [
      round.id,
      round.operatorId,
      round.playerId,
      round.clientRoundId,
      JSON.stringify(round.result),
      round.debit,
      round.createdAt,
    ],
  );
}

async function findByClientRoundWith(
  q: Querier,
  playerId: string,
  clientRoundId: string,
): Promise<StoredRound | undefined> {
  const { rows } = await q.query(
    `SELECT * FROM rounds WHERE player_id = $1 AND client_round_id = $2`,
    [playerId, clientRoundId],
  );
  return rows[0] ? mapRound(rows[0]) : undefined;
}

async function getRoundWith(
  q: Querier,
  id: string,
): Promise<StoredRound | undefined> {
  const { rows } = await q.query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  return rows[0] ? mapRound(rows[0]) : undefined;
}

async function getRoundForOperatorWith(
  q: Querier,
  operatorId: string,
  roundId: string,
): Promise<StoredRound | undefined> {
  const { rows } = await q.query(
    `SELECT * FROM rounds WHERE id = $1 AND operator_id = $2`,
    [roundId, operatorId],
  );
  return rows[0] ? mapRound(rows[0]) : undefined;
}

async function listRoundsWith(
  q: Querier,
  playerId: string,
  limit: number,
): Promise<StoredRound[]> {
  const { rows } = await q.query(
    `SELECT * FROM rounds WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [playerId, limit],
  );
  return rows.map(mapRound);
}

async function getFreeSessionWith(
  q: Querier,
  playerId: string,
): Promise<FreeGameSession | null> {
  const { rows } = await q.query(
    `SELECT session FROM free_sessions WHERE player_id = $1`,
    [playerId],
  );
  if (!rows[0]) return null;
  return rows[0].session as FreeGameSession;
}

async function setFreeSessionWith(
  q: Querier,
  playerId: string,
  session: FreeGameSession | null,
): Promise<void> {
  if (!session) {
    await q.query(`DELETE FROM free_sessions WHERE player_id = $1`, [playerId]);
    return;
  }
  await q.query(
    `INSERT INTO free_sessions (player_id, session, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (player_id) DO UPDATE SET session = $2::jsonb, updated_at = now()`,
    [playerId, JSON.stringify(session)],
  );
}

async function saveTopUpWith(q: Querier, intent: TopUpIntent): Promise<void> {
  await q.query(
    `INSERT INTO topup_intents (id, operator_id, player_id, amount, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      intent.id,
      intent.operatorId,
      intent.playerId,
      intent.amount,
      intent.status,
      intent.createdAt,
    ],
  );
}
