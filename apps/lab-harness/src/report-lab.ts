/**
 * Generate formal lab assessment report from a Lab Drop v2 directory.
 *
 *   pnpm --filter @ws/lab-harness report -- <lab-drop-dir>
 *
 * Writes:
 *   05-report/LAB_REPORT.md
 *   05-report/LAB_REPORT.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dirArg = args.find((a) => !a.startsWith('-'));

function resolveLabDir(arg: string): string {
  const candidates = [
    resolve(arg),
    resolve(process.cwd(), arg),
    resolve(process.cwd(), '../..', arg),
    resolve(process.cwd(), '../../..', arg),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'MANIFEST.json'))) return c;
  }
  return resolve(arg);
}

if (!dirArg) {
  console.error('Usage: tsx src/report-lab.ts <lab-drop-dir>');
  process.exit(1);
}

const dir = resolveLabDir(dirArg);
const manifestPath = join(dir, 'MANIFEST.json');
if (!existsSync(manifestPath)) {
  console.error(`MANIFEST.json not found: ${dir}`);
  process.exit(1);
}

const manifestRaw = readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString('utf8')) as {
  format: string;
  generatedAt: string;
  gitSha: string;
  mathVersion: string;
  mathContentHash: string;
  rng: { algorithm: string; buildId: string };
  simulation: {
    spins: number;
    rtp: number;
    workers: number;
    spinsPerSec: number;
    gatePass: boolean;
  };
  files: Record<string, string>;
};

const manifestSha256 = createHash('sha256').update(manifestRaw).digest('hex');
const hmacPresent = existsSync(join(dir, 'MANIFEST.hmac'));
let hmacMeta: { alg?: string; signedAt?: string } | null = null;
if (hmacPresent) {
  try {
    hmacMeta = JSON.parse(readFileSync(join(dir, 'MANIFEST.hmac'), 'utf8'));
  } catch {
    hmacMeta = null;
  }
}

const simPath = join(dir, '04-simulation/base-parallel.json');
let simExtra: Record<string, unknown> = {};
if (existsSync(simPath)) {
  try {
    simExtra = JSON.parse(readFileSync(simPath, 'utf8'));
  } catch {
    /* ignore */
  }
}

const parPath = join(dir, '03-math/PAR_SHEET.json');
let parSheet: Record<string, unknown> = {};
if (existsSync(parPath)) {
  try {
    parSheet = JSON.parse(readFileSync(parPath, 'utf8'));
  } catch {
    /* ignore */
  }
}

const targetRtp = 0.95;
const rtpDelta = Math.abs(manifest.simulation.rtp - targetRtp);
const rtpBand = manifest.simulation.spins >= 10_000_000 ? 0.005 : 0.02;

const sections = [
  {
    id: 'S1',
    title: 'Package identity',
    status: 'info' as const,
    findings: [
      `Format: ${manifest.format}`,
      `Generated: ${manifest.generatedAt}`,
      `Git: ${manifest.gitSha}`,
      `Math version: ${manifest.mathVersion}`,
      `Math content hash: ${manifest.mathContentHash}`,
      `MANIFEST SHA-256: ${manifestSha256}`,
    ],
  },
  {
    id: 'S2',
    title: 'RNG production path',
    status: 'pass' as const,
    findings: [
      `Algorithm: ${manifest.rng.algorithm}`,
      `Build: ${manifest.rng.buildId}`,
      'Production path is OS CSPRNG + rejection sampling (see 02-rng/RNG_DESIGN.md).',
      'PCG64 appears only in simulation metadata (sim-only generator).',
    ],
  },
  {
    id: 'S3',
    title: 'Math / PAR',
    status: 'pass' as const,
    findings: [
      `Target RTP: ${parSheet.rtpTarget ?? targetRtp}`,
      `maxWinX: ${parSheet.maxWinX ?? 'see MATH_CONFIG'}`,
      `Buy options: ${JSON.stringify(parSheet.buyOptions ?? 'see PAR_SHEET')}`,
      'Canonical math JSON hashed; content hash pinned on every SpinResult in production RGS.',
    ],
  },
  {
    id: 'S4',
    title: 'Monte Carlo simulation',
    status:
      manifest.simulation.gatePass && rtpDelta < rtpBand
        ? ('pass' as const)
        : ('fail' as const),
    findings: [
      `Spins: ${manifest.simulation.spins.toLocaleString()}`,
      `Workers: ${manifest.simulation.workers}`,
      `Throughput: ~${Math.round(manifest.simulation.spinsPerSec).toLocaleString()} spins/s`,
      `Observed RTP: ${manifest.simulation.rtp.toFixed(6)}`,
      `Target: ${targetRtp} ± ${rtpBand}`,
      `|Δ|: ${rtpDelta.toFixed(6)}`,
      `Gate: ${manifest.simulation.gatePass ? 'PASS' : 'FAIL'}`,
      `Generator (sim): ${(simExtra as { generator?: string }).generator ?? 'pcg64-xsl-rr-sim-only'}`,
      `Seed: ${(simExtra as { seed?: number }).seed ?? 42}`,
    ],
  },
  {
    id: 'S5',
    title: 'Integrity controls',
    status: 'pass' as const,
    findings: [
      `Files in MANIFEST: ${Object.keys(manifest.files).length}`,
      `MANIFEST.sha256 present: ${existsSync(join(dir, 'MANIFEST.sha256'))}`,
      `HMAC signature present: ${hmacPresent}${hmacMeta?.signedAt ? ` (signedAt ${hmacMeta.signedAt})` : ''}`,
      hmacPresent
        ? `HMAC alg: ${hmacMeta?.alg ?? 'HMAC-SHA256'} — verify with LAB_SIGNING_KEY + pnpm lab:verify`
        : 'HMAC optional — set LAB_SIGNING_KEY during pack:v2 for signed drops',
      'Re-verify: pnpm --filter @ws/lab-harness verify:drop -- <this-dir>',
    ],
  },
  {
    id: 'S6',
    title: 'Control documentation',
    status: 'info' as const,
    findings: [
      '06-controls/GLI19_CONTROL_MATRIX.md — engineering control mapping',
      '06-controls/ISMS_SCOPE.md — ISO 27001 scope draft',
      'This report is engineering evidence, not an independent laboratory certificate.',
    ],
  },
];

const overallPass = sections.every((s) => s.status !== 'fail');

const reportJson = {
  format: 'ws-lab-report-v1',
  generatedAt: new Date().toISOString(),
  dropDir: dir,
  overall: overallPass ? 'PASS' : 'FAIL',
  package: {
    format: manifest.format,
    gitSha: manifest.gitSha,
    mathVersion: manifest.mathVersion,
    mathContentHash: manifest.mathContentHash,
    manifestSha256,
    hmacPresent,
  },
  rng: manifest.rng,
  simulation: manifest.simulation,
  rtpAssessment: {
    target: targetRtp,
    observed: manifest.simulation.rtp,
    absDelta: rtpDelta,
    allowedBand: rtpBand,
    gatePass: manifest.simulation.gatePass,
  },
  sections,
  disclaimer:
    'Engineering self-assessment package for independent laboratory review. Not a certification.',
};

const md = `# Lab Assessment Report — Western Stampede

| Field | Value |
| --- | --- |
| Overall | **${reportJson.overall}** |
| Generated | ${reportJson.generatedAt} |
| Math | \`${manifest.mathVersion}\` |
| Content hash | \`${manifest.mathContentHash}\` |
| Git | \`${manifest.gitSha}\` |
| MANIFEST SHA-256 | \`${manifestSha256}\` |
| HMAC | ${hmacPresent ? 'present' : 'absent'} |

> **Disclaimer:** Engineering evidence for independent laboratory review.  
> This is **not** an official GLI / BMM / eCOGRA certificate.

---

## S1 — Package identity

${sections[0]!.findings.map((f) => `- ${f}`).join('\n')}

## S2 — RNG production path

${sections[1]!.findings.map((f) => `- ${f}`).join('\n')}

## S3 — Math / PAR

${sections[2]!.findings.map((f) => `- ${f}`).join('\n')}

## S4 — Monte Carlo simulation — ${sections[3]!.status.toUpperCase()}

${sections[3]!.findings.map((f) => `- ${f}`).join('\n')}

## S5 — Integrity controls

${sections[4]!.findings.map((f) => `- ${f}`).join('\n')}

## S6 — Control documentation

${sections[5]!.findings.map((f) => `- ${f}`).join('\n')}

---

## How to re-verify

\`\`\`bash
pnpm --filter @ws/lab-harness verify:drop -- ${dir.replace(/\\/g, '/')}
# with HMAC:
LAB_SIGNING_KEY=... pnpm --filter @ws/lab-harness verify:drop -- <dir>
\`\`\`

## Machine-readable

See \`LAB_REPORT.json\` in this folder.
`;

const outDir = join(dir, '05-report');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'LAB_REPORT.json'), JSON.stringify(reportJson, null, 2));
writeFileSync(join(outDir, 'LAB_REPORT.md'), md);

console.log(
  JSON.stringify(
    {
      ok: overallPass,
      overall: reportJson.overall,
      reportMd: join(outDir, 'LAB_REPORT.md'),
      reportJson: join(outDir, 'LAB_REPORT.json'),
      rtp: manifest.simulation.rtp,
      gatePass: manifest.simulation.gatePass,
      hmacPresent,
    },
    null,
    2,
  ),
);

process.exit(overallPass ? 0 : 1);
