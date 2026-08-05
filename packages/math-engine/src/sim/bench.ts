/**
 * Hardware-aware throughput bench for this host.
 * Target: quantify spins/sec single-thread vs parallel (cpus-2).
 */
import { availableParallelism, cpus } from 'node:os';
import { SeededPrng } from '../rng.js';
import { SpinEngine } from '../spin-engine.js';
import type { FreeGameSession } from '../spin-engine.js';
import { runParallelSim } from './parallel-sim.js';

const SPINS_SINGLE = 200_000;
const SPINS_PARALLEL = 1_000_000;

function singleThread(spins: number): { elapsedMs: number; spinsPerSec: number; rtp: number } {
  const engine = new SpinEngine(undefined, new SeededPrng(7));
  let freeSession: FreeGameSession | null = null;
  let wagered = 0;
  let won = 0;
  const t0 = performance.now();
  for (let i = 0; i < spins; i++) {
    const out = engine.spinSync({
      bet: 100,
      mode: freeSession ? 'FREE' : 'BASE',
      freeSession,
    });
    wagered += out.debitAmount;
    won += out.result.totalWin;
    freeSession = out.nextFreeSession;
  }
  const elapsedMs = performance.now() - t0;
  return {
    elapsedMs,
    spinsPerSec: (spins / elapsedMs) * 1000,
    rtp: wagered > 0 ? won / wagered : 0,
  };
}

async function main() {
  const cpuModel = cpus()[0]?.model ?? 'unknown';
  const logical = availableParallelism();

  const single = singleThread(SPINS_SINGLE);
  const parallel = await runParallelSim({
    spins: SPINS_PARALLEL,
    seed: 42,
  });

  const report = {
    host: {
      cpuModel,
      logicalProcessors: logical,
      recommendedWorkers: Math.max(1, logical - 2),
      node: process.version,
    },
    singleThread: {
      spins: SPINS_SINGLE,
      elapsedMs: Math.round(single.elapsedMs),
      spinsPerSec: Math.round(single.spinsPerSec),
      rtp: Number(single.rtp.toFixed(6)),
    },
    parallel: {
      spins: parallel.spins,
      workers: parallel.workers,
      elapsedMs: Math.round(parallel.elapsedMs),
      spinsPerSec: Math.round(parallel.spinsPerSec),
      rtp: Number(parallel.rtp.toFixed(6)),
      speedupVsSingleEstimate: Number(
        (
          parallel.spinsPerSec /
          Math.max(1, single.spinsPerSec)
        ).toFixed(2),
      ),
    },
    qualityGates: {
      minSingleSpinsPerSec: 20_000,
      minParallelSpinsPerSec: 80_000,
      singlePass: single.spinsPerSec >= 20_000,
      parallelPass: parallel.spinsPerSec >= 80_000,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.qualityGates.singlePass || !report.qualityGates.parallelPass) {
    console.error('[bench] throughput gate failed on this host');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
