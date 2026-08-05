import { createHash, randomUUID } from 'node:crypto';
import type { FreeGameSession } from '@ws/math-engine';
import type { SpinResult } from '@ws/shared';
import type {
  IStore,
  LedgerEntry,
  Operator,
  Player,
  Session,
  StoredRound,
  TopUpIntent,
} from './types.js';
import { DEMO_OPERATOR_CODE, DEMO_OPERATOR_ID } from './types.js';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export class MemoryStore implements IStore {
  readonly kind = 'memory' as const;
  operators = new Map<string, Operator>();
  operatorsByCode = new Map<string, string>();
  operatorsByKeyHash = new Map<string, string>();
  players = new Map<string, Player>();
  playersByExternal = new Map<string, string>(); // operatorId:externalRef → playerId
  sessions = new Map<string, Session>();
  rounds = new Map<string, StoredRound>();
  clientRoundIndex = new Map<string, string>();
  freeSessions = new Map<string, FreeGameSession>();
  topUps = new Map<string, TopUpIntent>();
  ledger: LedgerEntry[] = [];

  private chain: Promise<unknown> = Promise.resolve();

  private async serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async ensureDemoOperator(): Promise<Operator> {
    const existing = this.operators.get(DEMO_OPERATOR_ID);
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
    this.operators.set(op.id, op);
    this.operatorsByCode.set(op.code, op.id);
    this.operatorsByKeyHash.set(op.apiKeyHash, op.id);
    return op;
  }

  async getOperatorByCode(code: string): Promise<Operator | undefined> {
    const id = this.operatorsByCode.get(code);
    return id ? this.operators.get(id) : undefined;
  }

  async getOperatorById(id: string): Promise<Operator | undefined> {
    return this.operators.get(id);
  }

  async getOperatorByApiKeyHash(hash: string): Promise<Operator | undefined> {
    const id = this.operatorsByKeyHash.get(hash);
    return id ? this.operators.get(id) : undefined;
  }

  async createOperator(input: {
    code: string;
    name: string;
    apiKeyHash: string;
    walletMode?: Operator['walletMode'];
  }): Promise<Operator> {
    if (this.operatorsByCode.has(input.code)) {
      throw new Error('OPERATOR_CODE_EXISTS');
    }
    const op: Operator = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      apiKeyHash: input.apiKeyHash,
      walletMode: input.walletMode ?? 'demo',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.operators.set(op.id, op);
    this.operatorsByCode.set(op.code, op.id);
    this.operatorsByKeyHash.set(op.apiKeyHash, op.id);
    return op;
  }

  async rotateOperatorApiKey(
    code: string,
    newApiKeyHash: string,
  ): Promise<Operator> {
    const id = this.operatorsByCode.get(code);
    const op = id ? this.operators.get(id) : undefined;
    if (!op) throw new Error('OPERATOR_NOT_FOUND');
    this.operatorsByKeyHash.delete(op.apiKeyHash);
    op.apiKeyHash = newApiKeyHash;
    this.operatorsByKeyHash.set(newApiKeyHash, op.id);
    return op;
  }

  async createGuest(
    startBalance: number,
    operatorId?: string,
  ): Promise<{ player: Player; token: string }> {
    await this.ensureDemoOperator();
    const opId = operatorId ?? DEMO_OPERATOR_ID;
    const op = this.operators.get(opId);
    if (!op || op.status !== 'active') throw new Error('OPERATOR_INVALID');

    const id = randomUUID();
    const externalRef = `guest-${id.slice(0, 8)}`;
    const player: Player = {
      id,
      operatorId: opId,
      externalRef,
      displayName: `Guest-${id.slice(0, 6)}`,
      balance: startBalance,
      createdAt: new Date().toISOString(),
      version: 0,
    };
    this.players.set(id, player);
    this.playersByExternal.set(`${opId}:${externalRef}`, id);
    const token = randomUUID();
    this.sessions.set(token, {
      token,
      playerId: id,
      operatorId: opId,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    });
    return { player, token };
  }

  async createOperatorSession(input: {
    operatorId: string;
    externalRef: string;
    displayName?: string;
    startBalance?: number;
  }): Promise<{ player: Player; token: string }> {
    const op = this.operators.get(input.operatorId);
    if (!op || op.status !== 'active') throw new Error('OPERATOR_INVALID');

    const key = `${input.operatorId}:${input.externalRef}`;
    let playerId = this.playersByExternal.get(key);
    let player: Player;
    if (playerId) {
      player = this.players.get(playerId)!;
    } else {
      playerId = randomUUID();
      player = {
        id: playerId,
        operatorId: input.operatorId,
        externalRef: input.externalRef,
        displayName: input.displayName ?? input.externalRef,
        balance: input.startBalance ?? 0,
        createdAt: new Date().toISOString(),
        version: 0,
      };
      this.players.set(playerId, player);
      this.playersByExternal.set(key, playerId);
    }

    const token = randomUUID();
    this.sessions.set(token, {
      token,
      playerId: player.id,
      operatorId: input.operatorId,
      expiresAt: Date.now() + 24 * 3600 * 1000,
    });
    return { player, token };
  }

  async getSession(token: string): Promise<Session | undefined> {
    const s = this.sessions.get(token);
    if (!s) return undefined;
    if (s.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return s;
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async debit(playerId: string, amount: number, ref: string): Promise<Player> {
    const p = this.players.get(playerId);
    if (!p) throw new Error('PLAYER_NOT_FOUND');
    if (amount < 0) throw new Error('INVALID_AMOUNT');
    if (p.balance < amount) throw new Error('INSUFFICIENT_FUNDS');
    p.balance -= amount;
    p.version++;
    this.ledger.push({
      id: randomUUID(),
      operatorId: p.operatorId,
      playerId,
      type: 'debit',
      amount: -amount,
      ref,
      balanceAfter: p.balance,
      at: new Date().toISOString(),
    });
    return p;
  }

  async credit(playerId: string, amount: number, ref: string): Promise<Player> {
    const p = this.players.get(playerId);
    if (!p) throw new Error('PLAYER_NOT_FOUND');
    if (amount < 0) throw new Error('INVALID_AMOUNT');
    p.balance += amount;
    p.version++;
    this.ledger.push({
      id: randomUUID(),
      operatorId: p.operatorId,
      playerId,
      type: 'credit',
      amount,
      ref,
      balanceAfter: p.balance,
      at: new Date().toISOString(),
    });
    return p;
  }

  async saveRound(round: StoredRound): Promise<void> {
    this.rounds.set(round.id, round);
    this.clientRoundIndex.set(
      `${round.playerId}:${round.clientRoundId}`,
      round.id,
    );
  }

  async findByClientRound(
    playerId: string,
    clientRoundId: string,
  ): Promise<StoredRound | undefined> {
    const id = this.clientRoundIndex.get(`${playerId}:${clientRoundId}`);
    return id ? this.rounds.get(id) : undefined;
  }

  async getRound(id: string): Promise<StoredRound | undefined> {
    return this.rounds.get(id);
  }

  async getRoundForOperator(
    operatorId: string,
    roundId: string,
  ): Promise<StoredRound | undefined> {
    const r = this.rounds.get(roundId);
    if (!r || r.operatorId !== operatorId) return undefined;
    return r;
  }

  async listRounds(playerId: string, limit: number): Promise<StoredRound[]> {
    return [...this.rounds.values()]
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async getFreeSession(playerId: string): Promise<FreeGameSession | null> {
    return this.freeSessions.get(playerId) ?? null;
  }

  async setFreeSession(
    playerId: string,
    session: FreeGameSession | null,
  ): Promise<void> {
    if (session) this.freeSessions.set(playerId, session);
    else this.freeSessions.delete(playerId);
  }

  async saveTopUp(intent: TopUpIntent): Promise<void> {
    this.topUps.set(intent.id, intent);
  }

  async metrics(operatorId?: string) {
    let rounds = [...this.rounds.values()];
    if (operatorId) rounds = rounds.filter((r) => r.operatorId === operatorId);
    const wagered = rounds.reduce((a, r) => a + r.debit, 0);
    const won = rounds.reduce((a, r) => a + r.result.totalWin, 0);
    let players = this.players.size;
    if (operatorId) {
      players = [...this.players.values()].filter(
        (p) => p.operatorId === operatorId,
      ).length;
    }
    return { rounds: rounds.length, players, wagered, won };
  }

  async ready(): Promise<boolean> {
    return true;
  }

  async runSpinTransaction(
    fn: (tx: IStore) => Promise<SpinResult>,
  ): Promise<SpinResult> {
    return this.serial(() => fn(this));
  }
}
