/**
 * Lab Drop v2 — hashed, structured package for independent assessment.
 *
 * Usage:
 *   pnpm --filter @ws/lab-harness pack:v2
 *   LAB_SIM_SPINS=10000000 pnpm --filter @ws/lab-harness pack:v2
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { execSync } from 'node:child_process';
import { RNG_ALGORITHM_ID, RNG_BUILD_ID } from '@ws/rng-core';
import {
  MATH_VERSION,
  defaultInternalMath,
  mathContentHash,
  canonicalJson,
  runParallelSim,
} from '@ws/math-engine';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spins = Number(process.env.LAB_SIM_SPINS ?? 2_000_000);
const gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'nogit';
  }
})();

const outDir = resolve(
  root,
  'lab-output',
  `lab-drop-${MATH_VERSION}-${gitSha}-${Date.now()}`,
);

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function write(rel: string, content: string | Buffer) {
  const full = join(outDir, rel);
  ensureDir(dirname(full));
  writeFileSync(full, content);
  return full;
}

function copyDoc(srcRel: string, destRel: string) {
  const src = join(root, srcRel);
  if (existsSync(src)) {
    write(destRel, readFileSync(src));
  }
}

console.log(`[lab-v2] out=${outDir}`);
console.log(`[lab-v2] parallel sim N=${spins} cpus=${availableParallelism()}`);

const math = defaultInternalMath();
const contentHash = mathContentHash(math);
const sim = await runParallelSim({ spins, seed: 42 });

const rtpOk = Math.abs(sim.rtp - 0.95) < (spins >= 10_000_000 ? 0.005 : 0.02);

write(
  '00-README.md',
  `# Lab Drop v2 — Western Stampede

Math: \`${MATH_VERSION}\`  
Content hash: \`${contentHash}\`  
Git: \`${gitSha}\`  
RNG: \`${RNG_ALGORITHM_ID}\` / \`${RNG_BUILD_ID}\`

## Verify integrity

1. Recompute SHA-256 of every file listed in \`MANIFEST.json\`.
2. Confirm \`math-content-hash.txt\` matches canonical math JSON.
3. Re-run simulation with pinned seed if needed.

This package is engineering evidence for independent laboratory review.
`,
);

write(
  '01-system-description.md',
  readFileSync(join(root, 'docs/ARCHITECTURE.md'), 'utf8'),
);

copyDoc('docs/compliance/RNG_DESIGN.md', '02-rng/RNG_DESIGN.md');
write(
  '02-rng/SOURCE_PIN.txt',
  [
    `git=${gitSha}`,
    `rng_algorithm=${RNG_ALGORITHM_ID}`,
    `rng_build=${RNG_BUILD_ID}`,
    `math_version=${MATH_VERSION}`,
    `math_content_hash=${contentHash}`,
    `node=${process.version}`,
    `generatedAt=${new Date().toISOString()}`,
  ].join('\n') + '\n',
);

write('03-math/math-content-hash.txt', contentHash + '\n');
write('03-math/MATH_CONFIG.canonical.json', canonicalJson(math));
write(
  '03-math/PAR_SHEET.json',
  JSON.stringify(
    {
      mathVersion: MATH_VERSION,
      contentHash,
      rtpTarget: 0.95,
      buyOptions: math.buyOptions,
      features: math.features,
      maxWinX: math.maxWinX,
    },
    null,
    2,
  ),
);
copyDoc('docs/GAME_RULES.md', '03-math/GAME_RULES.md');
copyDoc('docs/MATH.md', '03-math/MATH.md');

write(
  '04-simulation/base-parallel.json',
  JSON.stringify(
    {
      ...sim,
      seed: 42,
      generator: 'pcg64-xsl-rr-sim-only',
      hostCpus: availableParallelism(),
      gate: { target: 0.95, pass: rtpOk },
    },
    null,
    2,
  ),
);

copyDoc('docs/compliance/GLI19_CONTROL_MATRIX.md', '06-controls/GLI19_CONTROL_MATRIX.md');
copyDoc('docs/compliance/isms/ISMS_SCOPE.md', '06-controls/ISMS_SCOPE.md');

// Walk files and build manifest
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(outDir).filter((f) => !f.endsWith('MANIFEST.json'));
const fileHashes: Record<string, string> = {};
for (const f of files) {
  const rel = relative(outDir, f).replace(/\\/g, '/');
  fileHashes[rel] = sha256File(f);
}

const manifest = {
  format: 'ws-lab-drop-v2',
  generatedAt: new Date().toISOString(),
  gitSha,
  mathVersion: MATH_VERSION,
  mathContentHash: contentHash,
  rng: { algorithm: RNG_ALGORITHM_ID, buildId: RNG_BUILD_ID },
  simulation: {
    spins: sim.spins,
    rtp: sim.rtp,
    workers: sim.workers,
    spinsPerSec: sim.spinsPerSec,
    gatePass: rtpOk,
  },
  files: fileHashes,
};

const manifestPath = write(
  'MANIFEST.json',
  JSON.stringify(manifest, null, 2),
);
const manifestHash = sha256File(manifestPath);
write('MANIFEST.sha256', `${manifestHash}  MANIFEST.json\n`);

// Optional HMAC signature when LAB_SIGNING_KEY is set (≥16 chars)
let signed = false;
const signingKey = process.env.LAB_SIGNING_KEY ?? '';
if (signingKey.length >= 16) {
  const { createHmac } = await import('node:crypto');
  const manifestRaw = readFileSync(manifestPath);
  const signature = createHmac('sha256', signingKey)
    .update(manifestRaw)
    .digest('hex');
  write(
    'MANIFEST.hmac',
    JSON.stringify(
      {
        alg: 'HMAC-SHA256',
        manifestSha256: manifestHash,
        signature,
        signedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  signed = true;
  console.log('[lab-v2] MANIFEST.hmac written (LAB_SIGNING_KEY)');
} else {
  console.log(
    '[lab-v2] skip HMAC (set LAB_SIGNING_KEY≥16 to auto-sign; or: pnpm --filter @ws/lab-harness sign -- <dir>)',
  );
}

// latest pointer
const latest = resolve(root, 'lab-output', 'latest-lab-v2.json');
writeFileSync(
  latest,
  JSON.stringify(
    {
      outDir,
      ...manifest.simulation,
      mathContentHash: contentHash,
      manifestSha256: manifestHash,
      signed,
    },
    null,
    2,
  ),
);

// Formal lab report (05-report/) — before final summary
const reportDir = join(outDir, '05-report');
ensureDir(reportDir);
const reportJson = {
  format: 'ws-lab-report-v1',
  generatedAt: new Date().toISOString(),
  overall: rtpOk ? 'PASS' : 'FAIL',
  package: {
    format: 'ws-lab-drop-v2',
    gitSha,
    mathVersion: MATH_VERSION,
    mathContentHash: contentHash,
    manifestSha256: manifestHash,
    hmacPresent: signed,
  },
  rng: { algorithm: RNG_ALGORITHM_ID, buildId: RNG_BUILD_ID },
  simulation: {
    spins: sim.spins,
    rtp: sim.rtp,
    workers: sim.workers,
    spinsPerSec: sim.spinsPerSec,
    gatePass: rtpOk,
  },
  rtpAssessment: {
    target: 0.95,
    observed: sim.rtp,
    absDelta: Math.abs(sim.rtp - 0.95),
    allowedBand: spins >= 10_000_000 ? 0.005 : 0.02,
    gatePass: rtpOk,
  },
  disclaimer:
    'Engineering self-assessment package for independent laboratory review. Not a certification.',
};
write('05-report/LAB_REPORT.json', JSON.stringify(reportJson, null, 2));
write(
  '05-report/LAB_REPORT.md',
  `# Lab Assessment Report — Western Stampede

| Field | Value |
| --- | --- |
| Overall | **${reportJson.overall}** |
| Generated | ${reportJson.generatedAt} |
| Math | \`${MATH_VERSION}\` |
| Content hash | \`${contentHash}\` |
| Git | \`${gitSha}\` |
| MANIFEST SHA-256 | \`${manifestHash}\` |
| HMAC | ${signed ? 'present' : 'absent'} |
| Spins | ${sim.spins.toLocaleString()} |
| Observed RTP | ${sim.rtp.toFixed(6)} |
| Gate | ${rtpOk ? 'PASS' : 'FAIL'} |

> Engineering evidence for independent laboratory review — **not** a formal lab certificate.

## Re-verify

\`\`\`bash
pnpm lab:verify:drop -- ${outDir.replace(/\\\\/g, '/')}
\`\`\`

See also \`LAB_REPORT.json\` and package \`00-README.md\`.
`,
);

// Re-hash report files into a supplemental note (MANIFEST already sealed —
// report is generated after MANIFEST intentionally so seal is stable.
// Consumers re-run `report` CLI to refresh after the fact.)
console.log('[lab-v2] wrote 05-report/LAB_REPORT.{md,json}');

console.log(
  JSON.stringify(
    {
      outDir,
      gitSha,
      mathVersion: MATH_VERSION,
      mathContentHash: contentHash,
      spins: sim.spins,
      rtp: sim.rtp,
      gatePass: rtpOk,
      files: Object.keys(fileHashes).length,
      manifestSha256: manifestHash,
      signed,
      report: join(outDir, '05-report/LAB_REPORT.md'),
    },
    null,
    2,
  ),
);

if (!rtpOk) {
  console.error('[lab-v2] RTP gate FAILED');
  process.exit(1);
}
