import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const verifyScript = resolve(here, 'verify-drop.ts');
const reportScript = resolve(here, 'report-lab.ts');

function sha(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function makeDrop(opts: { gatePass?: boolean; sign?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ws-verify-drop-'));
  const readme = '# test drop\n';
  writeFileSync(join(dir, '00-README.md'), readme);
  mkdirSync(join(dir, '03-math'), { recursive: true });
  const mch = 'abc'.repeat(21) + 'd'; // 64 hex-ish
  const contentHash = sha('math');
  writeFileSync(join(dir, '03-math/math-content-hash.txt'), contentHash + '\n');

  const files: Record<string, string> = {
    '00-README.md': sha(readme),
    '03-math/math-content-hash.txt': sha(contentHash + '\n'),
  };
  const manifest = {
    format: 'ws-lab-drop-v2',
    generatedAt: new Date().toISOString(),
    gitSha: 'test',
    mathVersion: 'western-stampede-1.3.0',
    mathContentHash: contentHash,
    rng: { algorithm: 'os-csprng+rejection-v1', buildId: 'rng-core@1.0.0' },
    simulation: {
      spins: 1000,
      rtp: 0.95,
      workers: 1,
      spinsPerSec: 1000,
      gatePass: opts.gatePass ?? true,
    },
    files,
  };
  const raw = JSON.stringify(manifest, null, 2);
  writeFileSync(join(dir, 'MANIFEST.json'), raw);
  writeFileSync(join(dir, 'MANIFEST.sha256'), `${sha(raw)}  MANIFEST.json\n`);

  if (opts.sign) {
    const signature = createHmac('sha256', opts.sign).update(raw).digest('hex');
    writeFileSync(
      join(dir, 'MANIFEST.hmac'),
      JSON.stringify({
        alg: 'HMAC-SHA256',
        manifestSha256: sha(raw),
        signature,
        signedAt: new Date().toISOString(),
      }),
    );
  }
  return dir;
}

/** Isolate from CI LAB_SIGNING_KEY so unsigned fixtures still pass. */
function cleanEnv(extra: Record<string, string> = {}) {
  const env = { ...process.env, ...extra };
  if (!('LAB_SIGNING_KEY' in extra)) {
    delete env.LAB_SIGNING_KEY;
  }
  return env;
}

describe('verify-drop + report', () => {
  it('passes a well-formed drop', () => {
    const dir = makeDrop();
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', verifyScript, dir],
      { encoding: 'utf8', env: cleanEnv() },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
  });

  it('fails on tampered file', () => {
    const dir = makeDrop();
    writeFileSync(join(dir, '00-README.md'), '# tampered\n');
    let failed = false;
    try {
      execFileSync(process.execPath, ['--import', 'tsx', verifyScript, dir], {
        encoding: 'utf8',
        env: cleanEnv(),
      });
    } catch {
      failed = true;
    }
    assert.equal(failed, true);
  });

  it('verifies HMAC when key set', () => {
    const key = 'verify-drop-test-key-16+';
    const dir = makeDrop({ sign: key });
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', verifyScript, dir],
      {
        encoding: 'utf8',
        env: cleanEnv({ LAB_SIGNING_KEY: key }),
      },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.checks.some((c: { name: string; ok: boolean }) => c.name === 'hmac' && c.ok));
  });

  it('report writes LAB_REPORT files', () => {
    const dir = makeDrop();
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', reportScript, dir],
      { encoding: 'utf8', env: cleanEnv() },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.overall, 'PASS');
    assert.ok(existsSync(join(dir, '05-report/LAB_REPORT.md')));
    assert.ok(existsSync(join(dir, '05-report/LAB_REPORT.json')));
  });
});
