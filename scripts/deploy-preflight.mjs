#!/usr/bin/env node
/**
 * Deploy preflight against a running RGS (or env-only static checks).
 *
 * Usage:
 *   pnpm deploy:preflight
 *   RGS_URL=http://host:13000 ADMIN_TOKEN=... pnpm deploy:preflight
 *
 * Exit 0 = pass, 1 = fail.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.RGS_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const adminToken = process.env.ADMIN_TOKEN ?? '';
const strict = process.env.PREFLIGHT_STRICT === 'true';

const findings = [];
const warnings = [];
const checks = [];

function note(name, ok, detail, severity = 'fail') {
  checks.push({ name, ok, detail });
  if (!ok) {
    if (severity === 'warn') warnings.push({ name, detail });
    else findings.push({ name, detail });
  }
}

// --- Static env / secret hygiene (local process env) ---
const jwt = process.env.JWT_SECRET ?? '';
const admin = process.env.ADMIN_TOKEN ?? '';
const cors = process.env.CORS_ORIGIN ?? '';
const realMoney = process.env.REAL_MONEY === 'true';

if (strict) {
  note(
    'jwt-not-default',
    jwt.length >= 16 && jwt !== 'dev-secret',
    jwt ? 'set' : 'missing',
  );
  note(
    'admin-not-default',
    admin.length >= 16 && admin !== 'dev-admin-token',
    admin ? 'set' : 'missing',
  );
  if (realMoney) {
    note(
      'cors-not-star-real-money',
      cors !== '' && cors !== '*',
      cors || 'empty',
    );
    note(
      'database-url-real-money',
      Boolean(process.env.DATABASE_URL),
      process.env.DATABASE_URL ? 'set' : 'missing',
    );
  }
} else {
  if (!jwt || jwt === 'dev-secret') {
    warnings.push({ name: 'jwt-default', detail: 'JWT_SECRET is default/empty' });
  }
  if (!admin || admin === 'dev-admin-token') {
    warnings.push({
      name: 'admin-default',
      detail: 'ADMIN_TOKEN is default/empty',
    });
  }
  if (realMoney && (cors === '*' || !cors)) {
    warnings.push({
      name: 'cors-open-real-money',
      detail: 'CORS_ORIGIN=* or empty with REAL_MONEY=true',
    });
  }
}

if (process.env.REAL_MONEY === 'true' && !process.env.DATABASE_URL) {
  findings.push({
    name: 'real-money-needs-db',
    detail: 'REAL_MONEY=true without DATABASE_URL',
  });
}

// Compose / docker files present
for (const f of [
  'docker-compose.yml',
  'docker-compose.prod-like.yml',
  'deploy/Dockerfile.rgs',
  'deploy/nginx-client.conf',
  'deploy/portainer.md',
]) {
  note(`file:${f}`, existsSync(resolve(root, f)), f);
}

// Package scripts
try {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  note(
    'script:security:scan',
    Boolean(pkg.scripts?.['security:scan']),
    'security:scan',
  );
  note(
    'script:test:smoke-load',
    Boolean(pkg.scripts?.['test:smoke-load']),
    'test:smoke-load',
  );
} catch (e) {
  findings.push({ name: 'package-json', detail: String(e) });
}

// --- Live probes (optional if RGS down and PREFLIGHT_LIVE=false) ---
const live = process.env.PREFLIGHT_LIVE !== 'false';

async function probe() {
  if (!live) {
    warnings.push({ name: 'live-skipped', detail: 'PREFLIGHT_LIVE=false' });
    return;
  }

  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    const hj = await h.json();
    note('live-health', h.ok && hj.ok === true, `status=${h.status} ok=${hj.ok}`);
    if (hj.store) note('live-store-reported', true, hj.store);
    if (hj.rateLimit) note('live-rate-limit', true, hj.rateLimit);
  } catch (e) {
    note('live-health', false, e instanceof Error ? e.message : String(e));
    return;
  }

  try {
    const r = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(5000) });
    const rj = await r.json();
    note('live-ready', r.ok && rj.ready === true, JSON.stringify(rj));
  } catch (e) {
    note('live-ready', false, e instanceof Error ? e.message : String(e));
  }

  try {
    const v = await fetch(`${base}/version`, { signal: AbortSignal.timeout(5000) });
    const vj = await v.json();
    note(
      'live-version',
      v.ok && Boolean(vj.mathVersion && vj.protocolVersion),
      vj.mathVersion ?? 'no-math',
    );
  } catch (e) {
    note('live-version', false, e instanceof Error ? e.message : String(e));
  }

  if (adminToken) {
    try {
      const o = await fetch(`${base}/api/v1/admin/ops`, {
        headers: { 'x-admin-token': adminToken },
        signal: AbortSignal.timeout(5000),
      });
      const oj = await o.json();
      note(
        'live-admin-ops',
        o.status === 200 || o.status === 503,
        `status=${o.status} ready=${oj.ready} warnings=${(oj.warnings ?? []).length}`,
      );
      if (Array.isArray(oj.warnings) && oj.warnings.length) {
        for (const w of oj.warnings) {
          warnings.push({ name: 'ops-warning', detail: w });
        }
      }
    } catch (e) {
      note('live-admin-ops', false, e instanceof Error ? e.message : String(e));
    }
  } else {
    warnings.push({
      name: 'admin-ops-skipped',
      detail: 'set ADMIN_TOKEN to probe /api/v1/admin/ops',
    });
  }
}

await probe();

const report = {
  ok: findings.length === 0,
  base,
  scannedAt: new Date().toISOString(),
  checks,
  findings,
  warnings,
};

console.log(JSON.stringify(report, null, 2));
if (findings.length) {
  console.error(`\n[deploy:preflight] FAIL — ${findings.length} finding(s)`);
  process.exit(1);
}
console.error(
  `\n[deploy:preflight] PASS — 0 findings, ${warnings.length} warning(s)`,
);
process.exit(0);
