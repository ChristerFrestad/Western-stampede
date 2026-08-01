import { randomUUID } from 'node:crypto';
import type { FreeGameSession } from '@ws/math-engine';
import type { SpinResult } from '@ws/shared';

export interface Player {
 id: string;
 displayName: string;
 balance: number;
 createdAt: string;
 /** Optimistic lock. */
 version: number;
}

export interface Session {
 token: string;
 playerId: string;
 expiresAt: number;
}

export interface StoredRound {
 id: string;
 playerId: string;
 clientRoundId: string;
 result: SpinResult;
 debit: number;
 createdAt: string;
}

export interface TopUpIntent {
 id: string;
 playerId: string;
 amount: number;
 status: 'completed' | 'pending';
 createdAt: string;
}

/**
 * In-memory store for demo / single-node Portainer.
 * Swap for Postgres adapters without changing controllers (IWallet / repository interfaces).
 */
export class MemoryStore {
 players = new Map<string, Player>();
 sessions = new Map<string, Session>();
 rounds = new Map<string, StoredRound>();
 /** clientRoundId → roundId for idempotency */
 clientRoundIndex = new Map<string, string>();
 freeSessions = new Map<string, FreeGameSession>();
 topUps = new Map<string, TopUpIntent>();
 ledger: Array<{
 id: string;
 playerId: string;
 type: string;
 amount: number;
 ref: string;
 balanceAfter: number;
 at: string;
 }> = [];

 createGuest(startBalance: number): { player: Player; token: string } {
 const id = randomUUID();
 const player: Player = {
 id,
 displayName: `Guest-${id.slice(0, 6)}`,
 balance: startBalance,
 createdAt: new Date().toISOString(),
 version: 0,
 };
 this.players.set(id, player);
 const token = randomUUID();
 this.sessions.set(token, {
 token,
 playerId: id,
 expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
 });
 return { player, token };
 }

 getSession(token: string): Session | undefined {
 const s = this.sessions.get(token);
 if (!s) return undefined;
 if (s.expiresAt < Date.now()) {
 this.sessions.delete(token);
 return undefined;
 }
 return s;
 }

 getPlayer(id: string): Player | undefined {
 return this.players.get(id);
 }

 debit(playerId: string, amount: number, ref: string): Player {
 const p = this.players.get(playerId);
 if (!p) throw new Error('PLAYER_NOT_FOUND');
 if (amount < 0) throw new Error('INVALID_AMOUNT');
 if (p.balance < amount) throw new Error('INSUFFICIENT_FUNDS');
 p.balance -= amount;
 p.version++;
 this.ledger.push({
 id: randomUUID(),
 playerId,
 type: 'debit',
 amount: -amount,
 ref,
 balanceAfter: p.balance,
 at: new Date().toISOString(),
 });
 return p;
 }

 credit(playerId: string, amount: number, ref: string): Player {
 const p = this.players.get(playerId);
 if (!p) throw new Error('PLAYER_NOT_FOUND');
 if (amount < 0) throw new Error('INVALID_AMOUNT');
 p.balance += amount;
 p.version++;
 this.ledger.push({
 id: randomUUID(),
 playerId,
 type: 'credit',
 amount,
 ref,
 balanceAfter: p.balance,
 at: new Date().toISOString(),
 });
 return p;
 }

 saveRound(round: StoredRound): void {
 this.rounds.set(round.id, round);
 this.clientRoundIndex.set(`${round.playerId}:${round.clientRoundId}`, round.id);
 }

 findByClientRound(playerId: string, clientRoundId: string): StoredRound | undefined {
 const id = this.clientRoundIndex.get(`${playerId}:${clientRoundId}`);
 return id ? this.rounds.get(id) : undefined;
 }
}

export const store = new MemoryStore();
