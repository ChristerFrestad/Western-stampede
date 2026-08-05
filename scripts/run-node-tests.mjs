#!/usr/bin/env node
/**
 * Cross-Node (20+) test runner: expands *.test.ts under src/ without relying
 * on shell/Node glob support (Node 20 does not expand ** globs for --test).
 *
 * Usage (from package root): node ../../scripts/run-node-tests.mjs
 * Or: node path/to/run-node-tests.mjs [dir=src]
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const startDir = resolve(root, process.argv[2] ?? 'src');
/** Optional filter: "stat" → only *.stat.test.ts; default → all *.test.ts */
const only = process.argv[3] ?? '';

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.test.ts') || name.endsWith('.test.js')) {
      if (only === 'stat' && !name.includes('.stat.test.')) continue;
      if (only === 'unit' && name.includes('.stat.test.')) continue;
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(startDir).sort();
if (files.length === 0) {
  console.error(
    `[run-node-tests] no matching *.test.ts under ${startDir}${only ? ` (filter=${only})` : ''}`,
  );
  process.exit(1);
}

// Use package name (not absolute path) — --import needs file:// on Windows for abs paths
const args = ['--import', 'tsx', '--test', ...files];
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
