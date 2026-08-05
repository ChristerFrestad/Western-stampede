import type { FreeGameSession } from '@ws/math-engine';
import type { SpinResult } from '@ws/shared';

/** Multi-tenant operator (B2B). */
export interface Operator {
  id: string;
  code: string;
  name: string;
  /** SHA-256 hex of API key (never store raw). */
  apiKeyHash: string;
  walletMode: 'demo' | 'seamless' | 'transfer';
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface Player {
  id: string;
  operatorId: string;
  /** Operator-side player reference (unique per operator). */
  externalRef: string;
  displayName: string;
  balance: number;
  createdAt: string;
  version: number;
}

export interface Session {
  token: string;
  playerId: string;
  operatorId: string;
  expiresAt: number;
}

export interface StoredRound {
  id: string;
  operatorId: string;
  playerId: string;
  clientRoundId: string;
  result: SpinResult;
  debit: number;
  createdAt: string;
}

export interface TopUpIntent {
  id: string;
  operatorId: string;
  playerId: string;
  amount: number;
  status: 'completed' | 'pending';
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  operatorId: string;
  playerId: string;
  type: string;
  amount: number;
  ref: string;
  balanceAfter: number;
  at: string;
}

export interface StoreMetrics {
  rounds: number;
  players: number;
  wagered: number;
  won: number;
}

export const DEMO_OPERATOR_CODE = 'demo';
export const DEMO_OPERATOR_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Async persistence port — Memory (tests/demo) or Postgres (production).
 */
export interface IStore {
  readonly kind: 'memory' | 'postgres';

  ensureDemoOperator(): Promise<Operator>;
  getOperatorByCode(code: string): Promise<Operator | undefined>;
  getOperatorById(id: string): Promise<Operator | undefined>;
  getOperatorByApiKeyHash(hash: string): Promise<Operator | undefined>;
  createOperator(input: {
    code: string;
    name: string;
    apiKeyHash: string;
    walletMode?: Operator['walletMode'];
  }): Promise<Operator>;
  /**
   * Replace operator API key hash (raw key is never stored).
   * Returns updated operator.
   */
  rotateOperatorApiKey(
    code: string,
    newApiKeyHash: string,
  ): Promise<Operator>;

  createGuest(
    startBalance: number,
    operatorId?: string,
  ): Promise<{ player: Player; token: string }>;
  /**
   * Operator launch: get-or-create player under operator, issue session.
   */
  createOperatorSession(input: {
    operatorId: string;
    externalRef: string;
    displayName?: string;
    startBalance?: number;
  }): Promise<{ player: Player; token: string }>;

  getSession(token: string): Promise<Session | undefined>;
  getPlayer(id: string): Promise<Player | undefined>;
  debit(playerId: string, amount: number, ref: string): Promise<Player>;
  credit(playerId: string, amount: number, ref: string): Promise<Player>;
  saveRound(round: StoredRound): Promise<void>;
  findByClientRound(
    playerId: string,
    clientRoundId: string,
  ): Promise<StoredRound | undefined>;
  getRound(id: string): Promise<StoredRound | undefined>;
  /** Tenant-safe: only returns if round.operatorId matches. */
  getRoundForOperator(
    operatorId: string,
    roundId: string,
  ): Promise<StoredRound | undefined>;
  listRounds(playerId: string, limit: number): Promise<StoredRound[]>;
  getFreeSession(playerId: string): Promise<FreeGameSession | null>;
  setFreeSession(
    playerId: string,
    session: FreeGameSession | null,
  ): Promise<void>;
  saveTopUp(intent: TopUpIntent): Promise<void>;
  metrics(operatorId?: string): Promise<StoreMetrics>;
  ready(): Promise<boolean>;

  runSpinTransaction?(
    fn: (tx: IStore) => Promise<SpinResult>,
  ): Promise<SpinResult>;
}
