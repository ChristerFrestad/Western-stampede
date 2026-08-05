import type { BuyTier } from '@ws/shared';
import { SeededPrng } from '../rng.js';
import { SpinEngine } from '../spin-engine.js';
import type { FreeGameSession } from '../spin-engine.js';
import { defaultInternalMath } from '../config/default-math.js';

async function runTier(tier: BuyTier, sessions: number, bet: number, seed: number) {
  const math = defaultInternalMath();
  const opt = math.buyOptions.find((b) => b.tier === tier)!;
  const cost = Math.floor(bet * opt.costX);

  let totalWin = 0;
  let totalDebit = 0;
  let totalSpins = 0;
  const sessionMults: number[] = [];

  for (let s = 0; s < sessions; s++) {
    const rng = new SeededPrng(seed + s * 9973);
    const engine = new SpinEngine(math, rng);
    let freeSession: FreeGameSession | null = null;
    let sessionWin = 0;
    let sessionDebit = 0;

    // Entry buy spin
    let out = engine.spinSync({
      bet,
      mode: 'BASE',
      buyTier: tier,
    });
    sessionDebit += out.debitAmount;
    sessionWin += out.result.totalWin;
    totalSpins++;
    freeSession = out.nextFreeSession;

    while (freeSession && freeSession.remaining > 0) {
      out = engine.spinSync({
        bet,
        mode: 'FREE',
        freeSession,
      });
      sessionDebit += out.debitAmount;
      sessionWin += out.result.totalWin;
      totalSpins++;
      freeSession = out.nextFreeSession;
    }

    totalWin += sessionWin;
    totalDebit += sessionDebit;
    sessionMults.push(sessionWin / bet);
  }

  sessionMults.sort((a, b) => a - b);
  const pct = (p: number) =>
    sessionMults[Math.min(sessionMults.length - 1, Math.floor(p * sessionMults.length))]!;

  const buyRtp = totalDebit > 0 ? totalWin / totalDebit : 0;
  const meanMult = sessionMults.reduce((a, b) => a + b, 0) / sessionMults.length;

  return {
    tier,
    costX: opt.costX,
    freeGames: opt.freeGames,
    sessions,
    bet,
    costPerBuy: cost,
    totalDebit,
    totalWin,
    buyRtp: Number(buyRtp.toFixed(6)),
    meanSessionMult: Number(meanMult.toFixed(4)),
    p50: Number(pct(0.5).toFixed(4)),
    p95: Number(pct(0.95).toFixed(4)),
    p99: Number(pct(0.99).toFixed(4)),
    maxMult: Number(sessionMults[sessionMults.length - 1]!.toFixed(4)),
    avgSpinsPerSession: Number((totalSpins / sessions).toFixed(2)),
    impliedFairCostX: Number((meanMult / 0.95).toFixed(2)),
  };
}

async function main() {
  const sessions = Number(process.argv[2] ?? 5_000);
  const bet = 100;
  const tiers: BuyTier[] = ['standard', 'enhanced', 'premium'];
  const rows = [];
  for (const tier of tiers) {
    rows.push(await runTier(tier, sessions, bet, 42));
  }
  console.log(JSON.stringify({ sessions, bet, tiers: rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
