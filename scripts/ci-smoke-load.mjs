#!/usr/bin/env node
/**
 * Start RGS, run headless smoke + spin load, then exit.
 * Used by CI and local `pnpm test:smoke-load`.
 *
 * Env:
 *   RGS_URL (default http://127.0.0.1:3000)
 *   PORT (default 3000)
 *   LOAD_SPINS (default 200)
 *   LOAD_CONCURRENCY (default 15)
 *   DATABASE_URL (optional durable)
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '3000';
const base = process.env.RGS_URL ?? `http://127.0.0.1:${port}`;
const loadSpins = process.env.LOAD_SPINS ?? '200';
const loadConc = process.env.LOAD_CONCURRENCY ?? '15';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        const j = await res.json();
        if (j.ok) return j;
      }
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`RGS not healthy at ${url}/health after ${attempts} attempts`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...opts.env },
    });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
    child.on('error', reject);
  });
}

const rgs = spawn(
  'pnpm',
  ['--filter', '@ws/rgs-api', 'exec', 'tsx', 'src/main.ts'],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      PORT: port,
      REAL_MONEY: 'false',
      COMPLIANCE_MODE: 'false',
    },
  },
);

let rgsLog = '';
rgs.stdout?.on('data', (d) => {
  rgsLog += d.toString();
  process.stdout.write(`[rgs] ${d}`);
});
rgs.stderr?.on('data', (d) => {
  rgsLog += d.toString();
  process.stderr.write(`[rgs] ${d}`);
});

function killRgs() {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(rgs.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      });
    } else {
      rgs.kill('SIGTERM');
      setTimeout(() => {
        try {
          rgs.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 2000);
    }
  } catch {
    /* ignore */
  }
}

process.on('exit', killRgs);
process.on('SIGINT', () => {
  killRgs();
  process.exit(130);
});

try {
  console.log(`[smoke-load] waiting for ${base}/health ...`);
  const health = await waitHealthy(base);
  console.log('[smoke-load] healthy', JSON.stringify(health));

  console.log('[smoke-load] headless smoke...');
  await run('pnpm', ['--filter', '@ws/headless-client', 'smoke'], {
    env: { RGS_URL: base },
  });

  console.log(
    `[smoke-load] load test spins=${loadSpins} concurrency=${loadConc}...`,
  );
  await run(
    'pnpm',
    [
      '--filter',
      '@ws/load-test',
      'exec',
      'tsx',
      'src/spin-load.ts',
      '--spins',
      String(loadSpins),
      '--concurrency',
      String(loadConc),
    ],
    { env: { RGS_URL: base } },
  );

  console.log('[smoke-load] PASS');
  killRgs();
  process.exit(0);
} catch (e) {
  console.error('[smoke-load] FAIL', e);
  console.error(rgsLog.slice(-2000));
  killRgs();
  process.exit(1);
}
