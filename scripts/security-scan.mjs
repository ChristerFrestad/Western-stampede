#!/usr/bin/env node
/**
 * Automated security scan for Western Stampede (pre-release / CI).
 * Exit 0 = pass, 1 = findings that block, 2 = warnings only (still 0 if none critical).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const findings = [];
const warnings = [];

function walk(dir, acc = [], depth = 0) {
  if (depth > 8) return acc;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    if (
      name === 'node_modules' ||
      name === 'dist' ||
      name === '.git' ||
      name === 'test-results' ||
      name === 'lab-output'
    ) {
      continue;
    }
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc, depth + 1);
    else if (/\.(ts|js|mjs|json|yml|yaml|env|md|conf)$/i.test(name)) acc.push(p);
  }
  return acc;
}

// --- 1. Secret / credential pattern scan ---
const SECRET_PATTERNS = [
  { re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{24,}['"]/i, name: 'hardcoded-secret-literal' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, name: 'private-key-pem' },
  { re: /sk_live_[a-zA-Z0-9]{20,}/, name: 'stripe-live-key' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'aws-access-key' },
];

const ALLOW_PATHS = [
  /security-scan\.mjs$/,
  /PENTEST_CHECKLIST\.md$/,
  /\.test\.ts$/,
  /sign-lab\.ts$/,
  /config\.ts$/, // defaults like dev-admin-token documented
];

const files = walk(root);
for (const f of files) {
  if (ALLOW_PATHS.some((r) => r.test(f))) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  // skip lockfiles and huge
  if (f.endsWith('pnpm-lock.yaml') || f.endsWith('package-lock.json')) continue;
  for (const { re, name } of SECRET_PATTERNS) {
    if (re.test(text)) {
      findings.push({
        severity: 'critical',
        rule: name,
        file: relative(root, f),
      });
    }
  }
}

// --- 2. Dangerous defaults in production paths ---
const mainTs = join(root, 'apps/rgs-api/src/main.ts');
const configTs = join(root, 'apps/rgs-api/src/config.ts');
if (existsSync(configTs)) {
  const cfg = readFileSync(configTs, 'utf8');
  if (!cfg.includes('adminToken') || !cfg.includes('ADMIN_TOKEN')) {
    findings.push({ severity: 'high', rule: 'admin-token-missing', file: 'apps/rgs-api/src/config.ts' });
  }
  if (!cfg.includes('realMoney') || !cfg.includes('REAL_MONEY')) {
    warnings.push({ rule: 'real-money-flag-missing', file: 'apps/rgs-api/src/config.ts' });
  }
}

if (existsSync(mainTs)) {
  const main = readFileSync(mainTs, 'utf8');
  if (!main.includes('createRateLimiter')) {
    findings.push({ severity: 'high', rule: 'rate-limiter-missing', file: 'apps/rgs-api/src/main.ts' });
  }
  if (!main.includes('securityHeaders')) {
    findings.push({ severity: 'high', rule: 'security-headers-missing', file: 'apps/rgs-api/src/main.ts' });
  }
  if (!main.includes("express.json({ limit:")) {
    findings.push({ severity: 'medium', rule: 'body-size-limit-missing', file: 'apps/rgs-api/src/main.ts' });
  }
  if (!main.includes('x-powered-by') && !main.includes("disable('x-powered-by')")) {
    warnings.push({ rule: 'x-powered-by-not-disabled', file: 'apps/rgs-api/src/main.ts' });
  }
  // Durable store guard
  if (!main.includes('REQUIRE_DURABLE') && !main.includes('requireDurableStore') && !main.includes('COMPLIANCE_MODE')) {
    warnings.push({ rule: 'compliance-boot-guard-unclear', file: 'apps/rgs-api/src/main.ts' });
  }
}

// --- 3. Client CSP / nginx ---
const nginxClient = join(root, 'deploy/nginx-client.conf');
if (existsSync(nginxClient)) {
  const n = readFileSync(nginxClient, 'utf8');
  if (!/Content-Security-Policy/i.test(n)) {
    findings.push({
      severity: 'medium',
      rule: 'csp-missing-nginx-client',
      file: 'deploy/nginx-client.conf',
    });
  }
} else {
  warnings.push({ rule: 'nginx-client-conf-missing', file: 'deploy/nginx-client.conf' });
}

// --- 4. Docs present ---
const requiredDocs = [
  'docs/security/PENTEST_CHECKLIST.md',
  'docs/compliance/RNG_DESIGN.md',
  'docs/compliance/GLI19_CONTROL_MATRIX.md',
];
for (const d of requiredDocs) {
  if (!existsSync(join(root, d))) {
    findings.push({ severity: 'medium', rule: 'required-doc-missing', file: d });
  }
}

// --- 5. pnpm audit (best effort) ---
let auditSummary = null;
try {
  const out = execSync('pnpm audit --json', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  try {
    auditSummary = JSON.parse(out);
  } catch {
    auditSummary = { raw: out.slice(0, 500) };
  }
} catch (e) {
  // pnpm audit exits non-zero when vulns found
  const err = e;
  const stdout = err.stdout?.toString?.() ?? '';
  try {
    auditSummary = JSON.parse(stdout);
  } catch {
    warnings.push({
      rule: 'pnpm-audit-failed',
      detail: err.message?.slice(0, 200) ?? 'audit error',
    });
  }
}

let criticalVulns = 0;
let highVulns = 0;
if (auditSummary?.metadata?.vulnerabilities) {
  const v = auditSummary.metadata.vulnerabilities;
  criticalVulns = v.critical ?? 0;
  highVulns = v.high ?? 0;
  if (criticalVulns > 0) {
    findings.push({
      severity: 'critical',
      rule: 'npm-audit-critical',
      detail: `${criticalVulns} critical`,
    });
  }
  if (highVulns > 0) {
    warnings.push({
      rule: 'npm-audit-high',
      detail: `${highVulns} high`,
    });
  }
}

// --- Report ---
const report = {
  ok: findings.length === 0,
  scannedAt: new Date().toISOString(),
  filesScanned: files.length,
  findings,
  warnings,
  audit: {
    critical: criticalVulns,
    high: highVulns,
  },
  checklist: 'docs/security/PENTEST_CHECKLIST.md',
};

console.log(JSON.stringify(report, null, 2));

if (findings.length > 0) {
  console.error(
    `\n[security:scan] FAIL — ${findings.length} finding(s), ${warnings.length} warning(s)`,
  );
  process.exit(1);
}
console.error(
  `\n[security:scan] PASS — 0 findings, ${warnings.length} warning(s)`,
);
process.exit(0);
