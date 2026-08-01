import { randomUUID } from 'node:crypto';
import {
 CryptoPrng,
 SpinEngine,
 buildPublicConfig,
 defaultInternalMath,
 type FreeGameSession,
 type IRngProvider,
} from '@ws/math-engine';
import type { BuyTier, SpinRequest, SpinResult } from '@ws/shared';
import { env } from './config.js';
import { store } from './store.js';

function createRng(): IRngProvider {
 // Pluggable: when RNG_PROVIDER=external, wire certified client here.
 if (env.rngProvider === 'external') {
 // Placeholder — throw until configured
 console.warn('[rng] RNG_PROVIDER=external not configured; falling back to local-crypto');
 }
 return new CryptoPrng();
}

export class GameService {
 private engine: SpinEngine;
 private math = defaultInternalMath();

 constructor() {
 this.engine = new SpinEngine(this.math, createRng());
 }

 getPublicConfig() {
 return {
 ...buildPublicConfig(!env.realMoney),
 guestStartBalance: env.guestStartBalance,
 };
 }

 getMath() {
 return this.math;
 }

 updateMath(partial: Partial<ReturnType<typeof defaultInternalMath>>) {
 this.math = { ...this.math, ...partial };
 this.engine.setMath(this.math);
 }

 async spin(playerId: string, req: SpinRequest): Promise<SpinResult> {
 const existing = store.findByClientRound(playerId, req.clientRoundId);
 if (existing) return existing.result;

 const player = store.getPlayer(playerId);
 if (!player) throw new Error('PLAYER_NOT_FOUND');

 const freeSession: FreeGameSession | null =
 store.freeSessions.get(playerId) ?? null;

 // Validate bet
 const cfg = this.getPublicConfig();
 if (!req.buyTier) {
 if (req.bet < cfg.minBet || req.bet > cfg.maxBet) {
 throw new Error('INVALID_BET');
 }
 } else {
 if (req.bet < cfg.minBet || req.bet > cfg.maxBet) {
 throw new Error('INVALID_BET');
 }
 if (freeSession && freeSession.remaining > 0) {
 throw new Error('FREE_GAMES_ACTIVE');
 }
 }

 // Preview debit for balance check
 let previewDebit = req.bet;
 if (req.buyTier) {
 const opt = this.math.buyOptions.find((b) => b.tier === req.buyTier);
 if (!opt) throw new Error('INVALID_BUY_TIER');
 previewDebit = Math.floor(req.bet * opt.costX);
 } else if (freeSession && freeSession.remaining > 0) {
 previewDebit = 0;
 }

 if (player.balance < previewDebit) {
 throw new Error('INSUFFICIENT_FUNDS');
 }

 if (freeSession && freeSession.remaining > 0) {
 // Migrate legacy sessions missing sessionBet
 if (freeSession.sessionBet == null) {
 freeSession.sessionBet = req.bet;
 }
 if (req.bet !== freeSession.sessionBet) {
 throw new Error('BET_LOCKED');
 }
 }

 let out;
 try {
 out = await this.engine.spin({
 bet: req.bet,
 mode: freeSession ? 'FREE' : 'BASE',
 freeSession,
 buyTier: req.buyTier as BuyTier | undefined,
 });
 } catch (e) {
 throw e instanceof Error ? e : new Error('SPIN_FAILED');
 }

 const roundId = randomUUID();
 if (out.debitAmount > 0) {
 store.debit(playerId, out.debitAmount, `spin-debit:${roundId}`);
 }
 if (out.result.totalWin > 0) {
 store.credit(playerId, out.result.totalWin, `spin-win:${roundId}`);
 }

 if (out.nextFreeSession) {
 store.freeSessions.set(playerId, out.nextFreeSession);
 } else {
 store.freeSessions.delete(playerId);
 }

 const updated = store.getPlayer(playerId)!;
 const result: SpinResult = {
 ...out.result,
 roundId,
 balance: updated.balance,
 };

 store.saveRound({
 id: roundId,
 playerId,
 clientRoundId: req.clientRoundId,
 result,
 debit: out.debitAmount,
 createdAt: new Date().toISOString(),
 });

 return result;
 }
}

export const gameService = new GameService();
