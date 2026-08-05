/**
 * Sign / verify Lab Drop MANIFEST with HMAC-SHA256.
 *
 *   LAB_SIGNING_KEY=secret pnpm --filter @ws/lab-harness sign -- <lab-drop-dir>
 *   LAB_SIGNING_KEY=secret pnpm --filter @ws/lab-harness verify -- <lab-drop-dir>
 *
 * Or auto-sign after pack:v2 when LAB_SIGNING_KEY is set.
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--');
const mode = args.includes('--verify') ? 'verify' : 'sign';
const dirArg = args.find((a) => a !== '--verify' && !a.startsWith('-'));
const key = process.env.LAB_SIGNING_KEY ?? '';

/** Resolve lab dir: absolute, cwd-relative, monorepo-root-relative, or lab-harness-relative. */
function resolveLabDir(arg: string): string {
  const candidates = [
    resolve(arg),
    resolve(process.cwd(), arg),
    resolve(process.cwd(), '../..', arg), // apps/lab-harness → monorepo root
    resolve(process.cwd(), '../../..', arg),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'MANIFEST.json'))) return c;
  }
  return resolve(arg);
}

const dir = dirArg ? resolveLabDir(dirArg) : '';

if (!dirArg || !dir || !existsSync(join(dir, 'MANIFEST.json'))) {
  console.error(
    'Usage: LAB_SIGNING_KEY=... tsx src/sign-lab.ts <lab-drop-dir> [--verify]',
  );
  console.error(`Tried: ${dirArg ?? '(none)'} → ${dir || '(empty)'}`);
  process.exit(1);
}
if (!key || key.length < 16) {
  console.error('LAB_SIGNING_KEY must be set (≥16 chars)');
  process.exit(1);
}

const manifestPath = join(dir, 'MANIFEST.json');
const manifestRaw = readFileSync(manifestPath);
const manifestHash = createHash('sha256').update(manifestRaw).digest('hex');
const sigPath = join(dir, 'MANIFEST.hmac');

function hmac(data: Buffer): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

if (mode === 'sign') {
  const sig = hmac(manifestRaw);
  const payload = {
    alg: 'HMAC-SHA256',
    manifestSha256: manifestHash,
    signature: sig,
    signedAt: new Date().toISOString(),
  };
  writeFileSync(sigPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify({ ok: true, mode: 'sign', ...payload, path: sigPath }, null, 2),
  );
  process.exit(0);
}

// verify
if (!existsSync(sigPath)) {
  console.error('MANIFEST.hmac missing');
  process.exit(1);
}
const signed = JSON.parse(readFileSync(sigPath, 'utf8')) as {
  manifestSha256: string;
  signature: string;
};
const expected = hmac(manifestRaw);
const a = Buffer.from(expected, 'hex');
const b = Buffer.from(String(signed.signature), 'hex');
const ok =
  a.length === b.length &&
  timingSafeEqual(a, b) &&
  signed.manifestSha256 === manifestHash;

console.log(
  JSON.stringify(
    {
      ok,
      mode: 'verify',
      manifestSha256: manifestHash,
      signatureMatch: ok,
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
