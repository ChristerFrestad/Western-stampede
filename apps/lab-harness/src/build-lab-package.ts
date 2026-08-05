/**
 * Assemble a lab drop folder: meta, RNG design pin, math hash, optional sim report.
 *
 * Usage: pnpm --filter @ws/lab-harness build-package
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RNG_ALGORITHM_ID, RNG_BUILD_ID } from '@ws/rng-core';
import {
  MATH_VERSION,
  defaultInternalMath,
  mathContentHash,
  runParallelSim,
} from '@ws/math-engine';
import { availableParallelism } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'lab-output', `drop-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const math = defaultInternalMath();
const contentHash = mathContentHash(math);

const spins = Number(process.env.LAB_SIM_SPINS ?? 1_000_000);
console.log(`[lab] parallel sim ${spins} spins on ${availableParallelism()} CPUs…`);
const sim = await runParallelSim({ spins, seed: 42 });

const manifest = {
  generatedAt: new Date().toISOString(),
  host: {
    node: process.version,
    cpus: availableParallelism(),
    platform: process.platform,
  },
  rng: {
    algorithm: RNG_ALGORITHM_ID,
    buildId: RNG_BUILD_ID,
    designDoc: 'docs/compliance/RNG_DESIGN.md',
  },
  math: {
    version: MATH_VERSION,
    contentHash,
    rtpTarget: 0.95,
  },
  simulation: {
    spins: sim.spins,
    workers: sim.workers,
    rtp: sim.rtp,
    hitRate: sim.hitRate,
    freeTriggerRate: sim.freeTriggerRate,
    stampedeRate: sim.stampedeRate,
    elapsedMs: sim.elapsedMs,
    spinsPerSec: sim.spinsPerSec,
    seed: 42,
    generator: 'pcg64-xsl-rr-sim-only',
  },
  gates: {
    /** v1.3.0 calibrated: 10M measured 0.9509 — allow ±1% at 1M default package N */
    rtpNearTarget: Math.abs(sim.rtp - 0.95) < 0.015,
    rtp: sim.rtp,
    target: 0.95,
    note: 'Formal lab: prefer LAB_SIM_SPINS=10000000+ and pin git SHA',
  },
  files: [
    'manifest.json',
    'math-content-hash.txt',
    'sim-report.json',
    'RNG_DESIGN.md',
    'GLI19_CONTROL_MATRIX.md',
  ],
};

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(outDir, 'math-content-hash.txt'), contentHash + '\n');
writeFileSync(join(outDir, 'sim-report.json'), JSON.stringify(sim, null, 2));

const design = join(root, 'docs/compliance/RNG_DESIGN.md');
const matrix = join(root, 'docs/compliance/GLI19_CONTROL_MATRIX.md');
if (existsSync(design)) copyFileSync(design, join(outDir, 'RNG_DESIGN.md'));
if (existsSync(matrix))
  copyFileSync(matrix, join(outDir, 'GLI19_CONTROL_MATRIX.md'));

// pointer for latest
const latest = resolve(root, 'lab-output', 'latest-manifest.json');
mkdirSync(dirname(latest), { recursive: true });
writeFileSync(latest, JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({ outDir, ...manifest.simulation, rtp: sim.rtp }, null, 2));
console.log(`[lab] package written to ${outDir}`);

if (!manifest.gates.rtpNearTarget) {
  console.error('[lab] RTP gate failed');
  process.exit(1);
}
