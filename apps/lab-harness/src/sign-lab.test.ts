import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const signScript = resolve(here, 'sign-lab.ts');

describe('lab HMAC sign/verify', () => {
  it('round-trips signature', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-lab-sign-'));
    const manifest = JSON.stringify(
      { format: 'ws-lab-drop-v2', mathVersion: '1.3.0', files: {} },
      null,
      2,
    );
    writeFileSync(join(dir, 'MANIFEST.json'), manifest);
    const key = 'test-signing-key-32chars-min!!';

    execFileSync(
      process.execPath,
      ['--import', 'tsx', signScript, dir],
      {
        env: { ...process.env, LAB_SIGNING_KEY: key },
        encoding: 'utf8',
      },
    );
    assert.ok(existsSync(join(dir, 'MANIFEST.hmac')));

    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', signScript, dir, '--verify'],
      {
        env: { ...process.env, LAB_SIGNING_KEY: key },
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.signatureMatch, true);
  });

  it('fails verify with wrong key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-lab-sign-'));
    writeFileSync(
      join(dir, 'MANIFEST.json'),
      JSON.stringify({ format: 'ws-lab-drop-v2' }),
    );
    const good = 'good-signing-key-32chars-min!!x';
    execFileSync(process.execPath, ['--import', 'tsx', signScript, dir], {
      env: { ...process.env, LAB_SIGNING_KEY: good },
    });

    let failed = false;
    try {
      execFileSync(
        process.execPath,
        ['--import', 'tsx', signScript, dir, '--verify'],
        {
          env: { ...process.env, LAB_SIGNING_KEY: 'bad-signing-key-32chars-min!!yy' },
          encoding: 'utf8',
        },
      );
    } catch {
      failed = true;
    }
    assert.equal(failed, true);
  });

  it('hmac matches pure crypto', () => {
    const raw = Buffer.from('{"a":1}');
    const key = 'pure-crypto-key-16+';
    const sig = createHmac('sha256', key).update(raw).digest('hex');
    const hash = createHash('sha256').update(raw).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(
      createHmac('sha256', key).update(raw).digest('hex'),
      'hex',
    );
    assert.ok(timingSafeEqual(a, b));
    assert.equal(hash.length, 64);
  });
});
