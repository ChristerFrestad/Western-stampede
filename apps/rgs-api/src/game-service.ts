import { randomUUID } from 'node:crypto';
import { HashChain } from '@ws/audit-core';
import {
  CryptoPrng,
  ProductionRngService,
  SpinEngine,
  StreamRngAdapter,
  assertProductionRng,
  buildPublicConfig,
  defaultInternalMath,
  type FreeGameSession,
  type IRngProvider,
} from '@ws/math-engine';
import type { BuyTier, SpinRequest, SpinResult } from '@ws/shared';
import { env } from './config.js';
import { getStore, type IStore } from './store/index.js';
import { withSpinSpan } from './telemetry.js';
import { mirrorWinCredit } from './wallet-bridge.js';

function createRngService(): ProductionRngService {
  if (env.rngProvider === 'external') {
    throw new Error(
      'RNG_PROVIDER=external is not configured. Wire a certified client or use RNG_PROVIDER=local',
    );
  }
  if (env.rngProvider !== 'local' && env.rngProvider !== 'production-csprng') {
    throw new Error(`Unknown RNG_PROVIDER: ${env.rngProvider}`);
  }
  return new ProductionRngService({ provider: 'production-csprng' });
}

export class GameService {
  private math = defaultInternalMath();
  private readonly rngService: ProductionRngService;
  private engine: SpinEngine;
  readonly audit = new HashChain();

  constructor() {
    this.rngService = createRngService();
    this.engine = new SpinEngine(this.math, new CryptoPrng('boot'));
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
    if (env.realMoney || env.complianceMode) {
      throw new Error('MATH_MUTATION_FORBIDDEN');
    }
    this.math = { ...this.math, ...partial };
    this.engine.setMath(this.math);
    this.audit.append({
      type: 'math.mutate',
      payload: { keys: Object.keys(partial) },
    });
  }

  rngHealth() {
    return this.rngService.health();
  }

  /**
   * Authoritative spin. When store supports runSpinTransaction (Postgres / Memory mutex),
   * the money path runs under a single serializable unit of work.
   */
  async spin(playerId: string, req: SpinRequest): Promise<SpinResult> {
    const store = getStore();
    return withSpinSpan(
      {
        playerId,
        buyTier: req.buyTier ?? '',
        bet: req.bet,
        store: store.kind,
      },
      async (span) => {
        const run = store.runSpinTransaction
          ? store.runSpinTransaction((tx) =>
              this.spinWithStore(tx, playerId, req),
            )
          : this.spinWithStore(store, playerId, req);
        const result = await run;
        span.attributes.roundId = result.roundId;
        span.attributes.totalWin = result.totalWin;
        return result;
      },
    );
  }

  private async spinWithStore(
    store: IStore,
    playerId: string,
    req: SpinRequest,
  ): Promise<SpinResult> {
    const existing = await store.findByClientRound(playerId, req.clientRoundId);
    if (existing) return existing.result;

    this.rngService.assertAvailable();

    const player = await store.getPlayer(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');

    const freeSession: FreeGameSession | null =
      await store.getFreeSession(playerId);

    const cfg = this.getPublicConfig();
    if (req.bet < cfg.minBet || req.bet > cfg.maxBet) {
      throw new Error('INVALID_BET');
    }
    if (req.buyTier && freeSession && freeSession.remaining > 0) {
      throw new Error('FREE_GAMES_ACTIVE');
    }

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

    let session = freeSession;
    if (session && session.remaining > 0) {
      if (session.sessionBet == null) {
        session = { ...session, sessionBet: req.bet };
      }
      if (req.bet !== session.sessionBet) {
        throw new Error('BET_LOCKED');
      }
    }

    const roundId = randomUUID();
    const stream = this.rngService.openStream(roundId);
    const rng: IRngProvider = new StreamRngAdapter(stream);
    assertProductionRng(rng);
    this.engine.setRng(rng);

    let out;
    try {
      out = this.engine.spinSync({
        bet: req.bet,
        mode: session ? 'FREE' : 'BASE',
        freeSession: session,
        buyTier: req.buyTier as BuyTier | undefined,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'RNG_UNAVAILABLE') throw e;
      throw e instanceof Error ? e : new Error('SPIN_FAILED');
    }

    if (out.debitAmount > 0) {
      await store.debit(playerId, out.debitAmount, `spin-debit:${roundId}`);
    }
    if (out.result.totalWin > 0) {
      await store.credit(playerId, out.result.totalWin, `spin-win:${roundId}`);
      // Seamless mirror (best-effort; outbox on failure)
      void mirrorWinCredit(
        player.externalRef,
        out.result.totalWin,
        `spin-win:${roundId}`,
        player.operatorId,
      );
    }

    await store.setFreeSession(playerId, out.nextFreeSession);

    const updated = await store.getPlayer(playerId);
    if (!updated) throw new Error('PLAYER_NOT_FOUND');

    const result: SpinResult = {
      ...out.result,
      roundId,
      balance: updated.balance,
      rngMeta: {
        ...out.result.rngMeta,
        ...stream.meta(),
      },
    };

    // Attach operator for telemetry parent (via audit already)
    await store.saveRound({
      id: roundId,
      operatorId: player.operatorId,
      playerId,
      clientRoundId: req.clientRoundId,
      result,
      debit: out.debitAmount,
      createdAt: new Date().toISOString(),
    });

    this.audit.append({
      type: 'round.completed',
      payload: {
        roundId,
        operatorId: player.operatorId,
        playerId,
        debit: out.debitAmount,
        win: result.totalWin,
        mathVersion: result.mathVersion,
        mathContentHash: result.mathContentHash,
        drawCount: result.rngMeta.drawCount ?? result.rngMeta.drawIds?.length,
        store: store.kind,
      },
    });

    return result;
  }
}

export const gameService = new GameService();
