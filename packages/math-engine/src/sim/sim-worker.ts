import { parentPort, workerData } from 'node:worker_threads';
import { SeededPrng } from '../rng.js';
import { SpinEngine } from '../spin-engine.js';
import type { FreeGameSession } from '../spin-engine.js';
import { defaultInternalMath } from '../config/default-math.js';

const { spins, bet, seed } = workerData as {
  spins: number;
  bet: number;
  seed: number;
};

try {
  const t0 = performance.now();
  const engine = new SpinEngine(defaultInternalMath(), new SeededPrng(seed));
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

  parentPort?.postMessage({
    spins,
    bet,
    wagered,
    won,
    hits,
    freeTriggers,
    stampedes,
    elapsedMs: performance.now() - t0,
    seed,
  });
} catch (e) {
  parentPort?.postMessage({
    error: e instanceof Error ? e.message : String(e),
  });
}
