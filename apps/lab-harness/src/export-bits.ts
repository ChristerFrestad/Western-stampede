/**
 * Export raw CSPRNG bytes for NIST SP 800-22 (or similar) offline analysis.
 *
 * Usage:
 *   pnpm --filter @ws/lab-harness export-bits [megabytes=10] [out=lab-bits.bin]
 *
 * Default writes 10 MiB of raw entropy from the production entropy source.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { OsCspongeEntropy, RNG_ALGORITHM_ID, RNG_BUILD_ID } from '@ws/rng-core';

const mb = Number(process.argv[2] ?? 10);
const outPath = resolve(process.argv[3] ?? 'lab-output/rng-bits.bin');

if (!Number.isFinite(mb) || mb <= 0 || mb > 512) {
  console.error('megabytes must be in (0, 512]');
  process.exit(1);
}

const bytes = Math.floor(mb * 1024 * 1024);
const entropy = new OsCspongeEntropy();
const chunkSize = 1024 * 1024;
const chunks: Uint8Array[] = [];
let remaining = bytes;

while (remaining > 0) {
  const n = Math.min(chunkSize, remaining);
  chunks.push(entropy.randomBytes(n));
  remaining -= n;
}

const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);

const meta = {
  algorithm: RNG_ALGORITHM_ID,
  buildId: RNG_BUILD_ID,
  entropySource: entropy.id,
  bytes: buf.length,
  path: outPath,
  exportedAt: new Date().toISOString(),
  note: 'Raw OS CSPRNG bytes for statistical lab suites (e.g. NIST SP 800-22). Not game draw stream.',
};

const metaPath = outPath.replace(/\.bin$/i, '') + '.meta.json';
writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log(JSON.stringify(meta, null, 2));
