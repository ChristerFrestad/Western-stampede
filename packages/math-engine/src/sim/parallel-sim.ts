/**
 * Multi-worker Monte Carlo harness sized for multi-core hosts
 * (e.g. Ryzen 7 3700X = 16 logical processors → default workers = cpus-2).
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ParallelSimOptions {
  spins: number;
  bet?: number;
  seed?: number;
  workers?: number;
}

export interface ParallelSimResult {
  spins: number;
  bet: number;
  wagered: number;
  won: number;
  rtp: number;
  hitRate: number;
  freeTriggers: number;
  freeTriggerRate: number;
  stampedes: number;
  stampedeRate: number;
  workers: number;
  elapsedMs: number;
  spinsPerSec: number;
  perWorker: Array<{ spins: number; rtp: number; elapsedMs: number }>;
}

export interface WorkerSimResult {
  spins: number;
  bet: number;
  wagered: number;
  won: number;
  hits: number;
  freeTriggers: number;
  stampedes: number;
  elapsedMs: number;
  seed: number;
}

function defaultWorkers(): number {
  const cpus = availableParallelism();
  return Math.max(1, cpus - 2);
}

function workerUrl(): { url: URL; useTsx: boolean } {
  const self = fileURLToPath(import.meta.url);
  const here = dirname(self);
  // Decide from *this* module extension only — parent may use tsx while we are in dist/
  if (extname(self) === '.ts') {
    return {
      url: pathToFileURL(join(here, 'sim-worker.ts')),
      useTsx: true,
    };
  }
  return {
    url: pathToFileURL(join(here, 'sim-worker.js')),
    useTsx: false,
  };
}

function runWorker(
  spins: number,
  bet: number,
  seed: number,
): Promise<WorkerSimResult> {
  const { url, useTsx } = workerUrl();
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, {
      workerData: { spins, bet, seed },
      execArgv: useTsx ? ['--import', 'tsx'] : [],
    });
    worker.on('message', (msg: WorkerSimResult | { error: string }) => {
      if (msg && typeof msg === 'object' && 'error' in msg) {
        reject(new Error(String(msg.error)));
      } else {
        resolve(msg as WorkerSimResult);
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exit ${code}`));
    });
  });
}

export async function runParallelSim(
  opts: ParallelSimOptions,
): Promise<ParallelSimResult> {
  const spins = opts.spins;
  const bet = opts.bet ?? 100;
  const seed = opts.seed ?? 42;
  const workers = opts.workers ?? defaultWorkers();
  const base = Math.floor(spins / workers);
  const rem = spins % workers;

  const t0 = performance.now();
  const tasks: Promise<WorkerSimResult>[] = [];
  for (let w = 0; w < workers; w++) {
    const n = base + (w < rem ? 1 : 0);
    if (n <= 0) continue;
    tasks.push(runWorker(n, bet, seed + w * 1_000_003));
  }
  const parts = await Promise.all(tasks);
  const elapsedMs = performance.now() - t0;

  let wagered = 0;
  let won = 0;
  let hits = 0;
  let freeTriggers = 0;
  let stampedes = 0;
  let totalSpins = 0;
  const perWorker = parts.map((p) => {
    wagered += p.wagered;
    won += p.won;
    hits += p.hits;
    freeTriggers += p.freeTriggers;
    stampedes += p.stampedes;
    totalSpins += p.spins;
    return {
      spins: p.spins,
      rtp: p.wagered > 0 ? p.won / p.wagered : 0,
      elapsedMs: p.elapsedMs,
    };
  });

  const rtp = wagered > 0 ? won / wagered : 0;
  return {
    spins: totalSpins,
    bet,
    wagered,
    won,
    rtp,
    hitRate: totalSpins > 0 ? hits / totalSpins : 0,
    freeTriggers,
    freeTriggerRate: totalSpins > 0 ? freeTriggers / totalSpins : 0,
    stampedes,
    stampedeRate: totalSpins > 0 ? stampedes / totalSpins : 0,
    workers: parts.length,
    elapsedMs,
    spinsPerSec: elapsedMs > 0 ? (totalSpins / elapsedMs) * 1000 : 0,
    perWorker,
  };
}
