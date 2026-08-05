import { availableParallelism } from 'node:os';
import { SeededPrng } from '../rng.js';
import { SpinEngine } from '../spin-engine.js';
import type { FreeGameSession } from '../spin-engine.js';
import { runParallelSim } from './parallel-sim.js';

/**
 * Usage:
 *   pnpm math:sim [spins=100000] [--parallel] [--workers=N] [--seed=42]
 */
async function main() {
  const args = process.argv.slice(2);
  const spins = Number(args.find((a) => !a.startsWith('--')) ?? 100_000);
  const parallel = args.includes('--parallel') || spins >= 1_000_000;
  const workersArg = args.find((a) => a.startsWith('--workers='));
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const workers = workersArg
    ? Number(workersArg.split('=')[1])
    : undefined;
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 42;
  const bet = 100;

  if (parallel) {
    const report = await runParallelSim({ spins, bet, seed, workers });
    console.log(
      JSON.stringify(
        {
          mode: 'parallel',
          hostCpus: availableParallelism(),
          ...report,
          rtp: Number(report.rtp.toFixed(6)),
          hitRate: Number(report.hitRate.toFixed(4)),
          freeTriggerRate: Number(report.freeTriggerRate.toFixed(6)),
          stampedeRate: Number(report.stampedeRate.toFixed(6)),
          spinsPerSec: Math.round(report.spinsPerSec),
        },
        null,
        2,
      ),
    );
    return;
  }

  const t0 = performance.now();
  const rng = new SeededPrng(seed);
  const engine = new SpinEngine(undefined, rng);
  let wagered = 0;
  let won = 0;
  let hits = 0;
  let freeTriggers = 0;
  let stampedes = 0;
  let freeSession: FreeGameSession | null = null;

  for (let i = 0; i < spins; i++) {
    const out = engine.spinSync({
      bet,
      mode: freeSession ? 'FREE' : 'BASE',
      freeSession,
    });
    wagered += out.debitAmount;
    won += out.result.totalWin;
    if (out.result.totalWin > 0) hits++;
    if (out.result.features.enteredFreeGames) freeTriggers++;
    if (out.result.features.stampede) stampedes++;
    freeSession = out.nextFreeSession;
  }

  const elapsedMs = performance.now() - t0;
  const rtp = wagered > 0 ? won / wagered : 0;
  console.log(
    JSON.stringify(
      {
        mode: 'single',
        hostCpus: availableParallelism(),
        spins,
        bet,
        wagered,
        won,
        rtp: Number(rtp.toFixed(6)),
        hitRate: Number((hits / spins).toFixed(4)),
        freeTriggers,
        freeTriggerRate: Number((freeTriggers / spins).toFixed(6)),
        stampedes,
        stampedeRate: Number((stampedes / spins).toFixed(6)),
        elapsedMs: Number(elapsedMs.toFixed(2)),
        spinsPerSec: Math.round((spins / elapsedMs) * 1000),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
