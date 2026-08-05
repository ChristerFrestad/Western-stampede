/**
 * Verify Lab Drop integrity:
 *  1. Every file listed in MANIFEST.json matches its SHA-256
 *  2. MANIFEST.sha256 matches MANIFEST.json
 *  3. Optional MANIFEST.hmac when LAB_SIGNING_KEY is set
 *
 * Usage:
 *   pnpm --filter @ws/lab-harness verify:drop -- <lab-drop-dir>
 *   LAB_SIGNING_KEY=... pnpm --filter @ws/lab-harness verify:drop -- <dir>
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
  console.error('Usage: tsx src/verify-drop.ts <lab-drop-dir>');
  process.exit(1);
}

const dir = resolveLabDir(dirArg);
const manifestPath = join(dir, 'MANIFEST.json');
if (!existsSync(manifestPath)) {
  console.error(`MANIFEST.json not found under ${dir}`);
  process.exit(1);
}

const manifestRaw = readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString('utf8')) as {
  format?: string;
  mathContentHash?: string;
  files?: Record<string, string>;
  simulation?: { gatePass?: boolean; rtp?: number; spins?: number };
};

const errors: string[] = [];
const checks: { name: string; ok: boolean; detail?: string }[] = [];

// 1. Format
const formatOk = manifest.format === 'ws-lab-drop-v2';
checks.push({ name: 'format', ok: formatOk, detail: manifest.format });
if (!formatOk) errors.push(`unexpected format: ${manifest.format}`);

// 2. MANIFEST.sha256
const shaPath = join(dir, 'MANIFEST.sha256');
const manifestHash = createHash('sha256').update(manifestRaw).digest('hex');
if (existsSync(shaPath)) {
  const line = readFileSync(shaPath, 'utf8').trim();
  const listed = line.split(/\s+/)[0] ?? '';
  const ok = listed === manifestHash;
  checks.push({ name: 'MANIFEST.sha256', ok, detail: listed });
  if (!ok) errors.push('MANIFEST.sha256 mismatch');
} else {
  checks.push({ name: 'MANIFEST.sha256', ok: false, detail: 'missing' });
  errors.push('MANIFEST.sha256 missing');
}

// 3. File hashes
const files = manifest.files ?? {};
let fileOk = 0;
let fileFail = 0;
for (const [rel, expected] of Object.entries(files)) {
  const full = join(dir, rel);
  if (!existsSync(full)) {
    fileFail++;
    errors.push(`missing file: ${rel}`);
    continue;
  }
  const actual = createHash('sha256').update(readFileSync(full)).digest('hex');
  if (actual !== expected) {
    fileFail++;
    errors.push(`hash mismatch: ${rel}`);
  } else {
    fileOk++;
  }
}
checks.push({
  name: 'file-hashes',
  ok: fileFail === 0 && fileOk > 0,
  detail: `${fileOk} ok, ${fileFail} fail, ${Object.keys(files).length} listed`,
});

// 4. math content hash file consistency
const mchPath = join(dir, '03-math/math-content-hash.txt');
if (existsSync(mchPath) && manifest.mathContentHash) {
  const fileHash = readFileSync(mchPath, 'utf8').trim();
  const ok = fileHash === manifest.mathContentHash;
  checks.push({ name: 'math-content-hash', ok });
  if (!ok) errors.push('math-content-hash.txt ≠ MANIFEST.mathContentHash');
}

// 5. RTP gate
if (manifest.simulation) {
  const gate = manifest.simulation.gatePass === true;
  checks.push({
    name: 'rtp-gate',
    ok: gate,
    detail: `rtp=${manifest.simulation.rtp} spins=${manifest.simulation.spins}`,
  });
  if (!gate) errors.push('simulation.gatePass is false');
}

// 6. Optional HMAC
const key = process.env.LAB_SIGNING_KEY ?? '';
const hmacPath = join(dir, 'MANIFEST.hmac');
if (key.length >= 16) {
  if (!existsSync(hmacPath)) {
    checks.push({ name: 'hmac', ok: false, detail: 'MANIFEST.hmac missing' });
    errors.push('LAB_SIGNING_KEY set but MANIFEST.hmac missing');
  } else {
    const signed = JSON.parse(readFileSync(hmacPath, 'utf8')) as {
      signature: string;
      manifestSha256: string;
    };
    const expected = createHmac('sha256', key).update(manifestRaw).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(signed.signature), 'hex');
    const ok =
      a.length === b.length &&
      timingSafeEqual(a, b) &&
      signed.manifestSha256 === manifestHash;
    checks.push({ name: 'hmac', ok });
    if (!ok) errors.push('HMAC verification failed');
  }
} else if (existsSync(hmacPath)) {
  checks.push({
    name: 'hmac',
    ok: true,
    detail: 'present (skipped verify — set LAB_SIGNING_KEY to validate)',
  });
} else {
  checks.push({ name: 'hmac', ok: true, detail: 'not present (optional)' });
}

const ok = errors.length === 0;
const report = {
  ok,
  dir,
  checks,
  errors,
  manifestSha256: manifestHash,
  filesChecked: Object.keys(files).length,
};

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
