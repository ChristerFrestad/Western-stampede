/**
 * Headless consumer of Game Protocol — second frontend proof.
 * Usage: RGS_URL=http://127.0.0.1:3000 pnpm --filter @ws/headless-client smoke
 */
import { GameProtocolClient } from '@ws/game-protocol';

const baseUrl = process.env.RGS_URL ?? 'http://127.0.0.1:3000';

async function main() {
  const healthRes = await fetch(`${baseUrl}/health`);
  if (!healthRes.ok) throw new Error(`HEALTH_${healthRes.status}`);
  const health = (await healthRes.json()) as { ok: boolean };
  if (!health.ok) throw new Error('HEALTH_NOT_OK');

  const readyRes = await fetch(`${baseUrl}/ready`);
  const ready = (await readyRes.json()) as { ready: boolean };
  if (!ready.ready) throw new Error('READY_FALSE');

  const client = new GameProtocolClient({ baseUrl });
  const guest = await client.guestAuth();
  console.log(
    JSON.stringify(
      { ok: true, playerId: guest.playerId, balance: guest.balance },
      null,
      2,
    ),
  );

  const cfg = (await client.getConfig()) as {
    buyOptions: Array<{ tier: string; costX: number }>;
    version: string;
  };
  if (!cfg.buyOptions?.length || cfg.buyOptions.length < 3) {
    throw new Error('HEADLESS_BUY_OPTIONS');
  }
  console.log(
    JSON.stringify(
      {
        mathVersion: cfg.version,
        buy: cfg.buyOptions.map((b) => `${b.tier}:${b.costX}`),
      },
      null,
      2,
    ),
  );

  const spin = (await client.spin({
    bet: 100,
    clientRoundId: `headless-${Date.now()}`,
  })) as {
    roundId: string;
    totalWin: number;
    balance: number;
    mathContentHash?: string;
    rngMeta: { algorithm?: string; drawCount?: number };
  };

  console.log(
    JSON.stringify(
      {
        roundId: spin.roundId,
        totalWin: spin.totalWin,
        balance: spin.balance,
        mathHash: spin.mathContentHash?.slice(0, 16),
        rng: spin.rngMeta.algorithm,
        draws: spin.rngMeta.drawCount,
      },
      null,
      2,
    ),
  );

  if (!spin.mathContentHash || spin.mathContentHash.length !== 64) {
    throw new Error('HEADLESS_MISSING_MATH_HASH');
  }
  if (!spin.rngMeta.algorithm?.includes('csprng')) {
    throw new Error('HEADLESS_BAD_RNG_META');
  }

  // Idempotency: same clientRoundId → single debit
  const idempId = `headless-idemp-${Date.now()}`;
  const s1 = (await client.spin({
    bet: 100,
    clientRoundId: idempId,
  })) as { balance: number; totalWin: number; roundId: string };
  const s2 = (await client.spin({
    bet: 100,
    clientRoundId: idempId,
  })) as { balance: number; totalWin: number; roundId: string };
  if (s1.roundId !== s2.roundId) {
    throw new Error('HEADLESS_IDEMPOTENCY_ROUND_MISMATCH');
  }
  if (s1.balance !== s2.balance) {
    throw new Error('HEADLESS_IDEMPOTENCY_BALANCE_MISMATCH');
  }

  // Buy standard via same protocol client (second guest for clean free session)
  const buyer = new GameProtocolClient({ baseUrl });
  const bg = await buyer.guestAuth();
  const standard = cfg.buyOptions.find((b) => b.tier === 'standard');
  if (!standard) throw new Error('HEADLESS_NO_STANDARD_BUY');
  const bet = 100;
  const cost = Math.floor(bet * standard.costX);
  const buy = (await buyer.spin({
    bet,
    clientRoundId: `headless-buy-${Date.now()}`,
    buyTier: 'standard',
  })) as {
    balance: number;
    totalWin: number;
    mode: string;
    features: Record<string, unknown>;
    mathContentHash?: string;
  };
  const expectedBal = bg.balance - cost + buy.totalWin;
  if (buy.balance !== expectedBal) {
    throw new Error(
      `HEADLESS_BUY_BALANCE expected=${expectedBal} got=${buy.balance}`,
    );
  }
  const remaining = Number(buy.features?.freeGamesRemaining ?? 0);
  if (!buy.features?.buyEntered && remaining < 1) {
    throw new Error('HEADLESS_BUY_NO_FREE_SESSION');
  }
  console.log(
    JSON.stringify(
      {
        buyTier: 'standard',
        freeGamesRemaining: remaining,
        mode: buy.mode,
        balance: buy.balance,
      },
      null,
      2,
    ),
  );

  console.log('[headless] smoke OK');
}

main().catch((e) => {
  console.error('[headless] FAIL', e);
  process.exit(1);
});
